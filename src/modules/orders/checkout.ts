import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { OrderStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import type { Tx } from "@/lib/db-types";
import { ensureDayMaterialized } from "@/modules/availability/materialize";
import { validateServiceDate } from "@/modules/availability/dates";
import { notify } from "@/modules/notifications/events";
import { getPaymentProvider, configuredGatewayKind, appUrl } from "@/modules/payments/providers";
import { cutoffInstant, dateKeyToDb, zonedInstant } from "@/modules/shared/time";
import { paymentCapturedEntries } from "@/modules/wallet/entries";
import { lockWalletBalance, postLedgerTransaction } from "@/modules/wallet/ledger-tx";
import { generateOrderCode } from "./codes";
import { buildOrderDraft, orderItemsCreateData, orderNutritionData, type DraftDish } from "./draft";
import { DISH_MENU_INCLUDE, dishNutrition, toGroupDefs } from "./menu-defs";
import { splitPayment } from "./payment-decision";
import { advanceDiscountBps, hoursBetween } from "./pricing";
import { ReservationError, reserveCapacity } from "./reservation";
import { checkoutSchema, fieldErrorsOf, type CheckoutInput } from "./schemas";

// Checkout de un pedido suelto (RF-C4): valida, reserva cupo y stock con
// bloqueos, calcula precio/macros en el servidor y crea el pedido
// PENDING_PAYMENT con su pago. Si el saldo cubre todo, se confirma en el acto.

export type PlaceOrderResult =
  | { ok: true; orderId: string; code: string; status: OrderStatus; redirectUrl: string; reused: boolean }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export const TX_OPTIONS = { maxWait: 15_000, timeout: 20_000 } as const;

export function resultPath(code: string) {
  return `/pagos/resultado/${code}`;
}

export async function placeOrder(userId: string, raw: unknown, opts: { now?: Date } = {}): Promise<PlaceOrderResult> {
  const now = opts.now ?? new Date();
  const parsed = checkoutSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors = fieldErrorsOf(parsed.error);
    return { ok: false, error: Object.values(fieldErrors)[0]?.[0] ?? "Revisá los datos del pedido.", fieldErrors };
  }
  const input = parsed.data;

  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true, isActive: true, email: true } });
  if (!user || !user.isActive) return { ok: false, error: "Tenés que ingresar para pedir." };
  if (user.role !== "CUSTOMER") return { ok: false, error: "Solo las cuentas de cliente pueden hacer pedidos." };

  // Doble submit / reintento: mismo checkoutKey → mismo pedido.
  const previous = await findByCheckoutKey(input.checkoutKey);
  if (previous) return reuse(previous, userId);

  const restaurant = await db.restaurant.findUnique({
    where: { slug: input.restaurantSlug },
    include: { discountTiers: true },
  });
  if (!restaurant || restaurant.status !== "ACTIVE") return { ok: false, error: "Este restaurante no está recibiendo pedidos." };

  const dateCheck = validateServiceDate(input.date, now, restaurant);
  if (!dateCheck.ok) return { ok: false, error: dateCheck.error, fieldErrors: { date: [dateCheck.error] } };

  if (input.fulfillment === "PICKUP" && !restaurant.pickupEnabled) return { ok: false, error: "Este restaurante no ofrece retiro." };
  if (input.fulfillment === "DELIVERY" && !restaurant.deliveryEnabled) return { ok: false, error: "Este restaurante no hace delivery." };

  // Dirección y costo de envío (solo zonas que cubre el restaurante).
  let deliveryFee = 0;
  let deliveryAddress: Prisma.InputJsonValue | undefined;
  if (input.fulfillment === "DELIVERY") {
    const address = await db.customerAddress.findFirst({ where: { id: input.addressId, userId }, include: { zone: true } });
    if (!address) return { ok: false, error: "Elegí una dirección de entrega.", fieldErrors: { addressId: ["Elegí una dirección"] } };
    const zone = await db.deliveryZone.findUnique({ where: { restaurantId_zoneId: { restaurantId: restaurant.id, zoneId: address.zoneId } } });
    if (!zone) {
      const msg = `${restaurant.name} no hace delivery a ${address.zone.name}.`;
      return { ok: false, error: msg, fieldErrors: { addressId: [msg] } };
    }
    deliveryFee = zone.fee;
    deliveryAddress = {
      label: address.label,
      street: address.street,
      reference: address.reference,
      zone: address.zone.name,
      zoneId: address.zoneId,
    };
  }

  // Menú vigente de los platos pedidos (no borrados, activos, del restaurante).
  const dishIds = [...new Set(input.items.map((i) => i.dishId))];
  const dishRows = await db.dish.findMany({
    where: { id: { in: dishIds }, restaurantId: restaurant.id, isActive: true, deletedAt: null },
    include: DISH_MENU_INCLUDE,
  });
  const dishes = new Map<string, DraftDish>(
    dishRows.map((d) => [
      d.id,
      { id: d.id, name: d.name, photoUrl: d.photoUrl, basePrice: d.basePrice, allowNotes: d.allowNotes, nutrition: dishNutrition(d), groups: toGroupDefs(d.modifierGroups) },
    ]),
  );
  const limitedOptions = new Map<string, string>();
  for (const d of dishRows) for (const l of d.modifierGroups) for (const o of l.group.options) if (o.dailyStock !== null) limitedOptions.set(o.id, o.name);

  // Validación de selección antes de bloquear nada (el precio se calcula adentro).
  const precheck = buildOrderDraft({ dishes, items: input.items, discountBps: 0, deliveryFee, commissionBps: restaurant.commissionBps });
  if (!precheck.ok) return { ok: false, error: precheck.error, fieldErrors: { items: [precheck.error] } };

  const settings = await db.platformSettings.findUnique({ where: { id: 1 } });
  const holdMinutes = settings?.holdMinutes ?? 10;
  const gatewayKind = configuredGatewayKind();

  type TxResult = { kind: "created"; orderId: string; code: string; status: OrderStatus; paymentId: string; gatewayAmount: number } | { kind: "reused"; orderId: string };

  let result: TxResult;
  try {
    result = await db.$transaction(async (tx): Promise<TxResult> => {
      await ensureDayMaterialized(tx, restaurant.id, input.date);
      const slot = await reserveCapacity(tx, {
        restaurantId: restaurant.id,
        date: input.date,
        slotId: input.slotId,
        fulfillment: input.fulfillment,
        items: precheck.draft.lines.map((l) => ({
          dishId: l.dish.id,
          dishName: l.dish.name,
          quantity: l.quantity,
          optionIds: l.selected.map((s) => s.option.id),
        })),
        limitedOptions,
        now,
      });

      // Con la franja bloqueada, un doble submit concurrente ya ve el pedido del primero.
      const again = await tx.order.findUnique({ where: { checkoutKey: input.checkoutKey }, select: { id: true } });
      if (again) return { kind: "reused", orderId: again.id };

      const slotStart = zonedInstant(input.date, slot.startMinute);
      const discountBps = advanceDiscountBps(restaurant.discountTiers, hoursBetween(now, slotStart));
      const priced = buildOrderDraft({ dishes, items: input.items, discountBps, deliveryFee, commissionBps: restaurant.commissionBps });
      if (!priced.ok) throw new Error(priced.error);
      const { draft } = priced;

      // Billetera: se bloquea el saldo para que dos checkouts no lo gasten dos veces.
      let walletBalance = 0;
      let walletReserved = 0;
      if (input.useWallet) {
        walletBalance = await lockWalletBalance(tx, userId);
        walletReserved = await reservedWalletAmount(tx, userId, now);
      }
      const split = splitPayment({ total: draft.price.total, useWallet: input.useWallet, walletBalance, walletReserved });

      const holdExpiresAt = new Date(now.getTime() + holdMinutes * 60_000);
      const code = await uniqueCode(tx);
      const order = await tx.order.create({
        data: {
          code,
          customerId: userId,
          restaurantId: restaurant.id,
          kind: "SINGLE",
          checkoutKey: input.checkoutKey,
          serviceDate: dateKeyToDb(input.date),
          slotId: slot.id,
          slotStartMinute: slot.startMinute,
          slotEndMinute: slot.endMinute,
          fulfillment: input.fulfillment,
          deliveryAddress,
          cutoffAt: cutoffInstant(input.date, restaurant.cutoffDaysBefore, restaurant.cutoffMinute),
          status: "PENDING_PAYMENT",
          holdExpiresAt,
          itemsSubtotal: draft.price.itemsSubtotal,
          discountKind: discountBps === 0 ? "NONE" : "ADVANCE",
          discountBps,
          discountAmount: draft.price.discountAmount,
          deliveryFee: draft.price.deliveryFee,
          total: draft.price.total,
          commissionBps: restaurant.commissionBps,
          commissionAmount: draft.price.commissionAmount,
          ...orderNutritionData(draft.nutrition),
          allergens: input.allergens,
          allergyOther: input.allergyOther ?? null,
          createdAt: now,
          items: { create: orderItemsCreateData(draft) },
          events: { create: { fromStatus: null, toStatus: "PENDING_PAYMENT", actorId: userId, createdAt: now } },
        },
      });

      const payment = await tx.payment.create({
        data: {
          customerId: userId,
          purpose: "ORDER",
          orderId: order.id,
          amount: order.total,
          walletAmount: split.walletAmount,
          gatewayAmount: split.gatewayAmount,
          provider: split.walletOnly ? "WALLET" : gatewayKind,
          status: split.walletOnly ? "APPROVED" : "PENDING",
          idempotencyKey: `order:${order.id}:checkout`,
          expiresAt: holdExpiresAt,
          approvedAt: split.walletOnly ? now : null,
          createdAt: now,
        },
      });

      if (split.walletOnly) {
        await postLedgerTransaction(tx, {
          type: "PAYMENT_CAPTURED",
          description: `Pago con billetera · pedido ${order.code}`,
          idempotencyKey: `payment:${payment.id}:captured`,
          paymentId: payment.id,
          orderId: order.id,
          createdById: userId,
          entries: paymentCapturedEntries({
            userId,
            restaurantId: restaurant.id,
            gatewayAmount: 0,
            walletAmount: split.walletAmount,
            commissionAmount: order.commissionAmount,
          }),
        });
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: "CONFIRMED",
            confirmedAt: now,
            events: { create: { fromStatus: "PENDING_PAYMENT", toStatus: "CONFIRMED", actorId: userId, reason: "Pagado con saldo de billetera", createdAt: now } },
          },
        });
      }

      return {
        kind: "created",
        orderId: order.id,
        code: order.code,
        status: split.walletOnly ? "CONFIRMED" : "PENDING_PAYMENT",
        paymentId: payment.id,
        gatewayAmount: split.gatewayAmount,
      };
    }, TX_OPTIONS);
  } catch (error) {
    if (error instanceof ReservationError) {
      return { ok: false, error: error.message, fieldErrors: error.code.startsWith("SLOT") ? { slotId: [error.message] } : { items: [error.message] } };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Carrera con el mismo checkoutKey en otra franja: devolver el pedido ganador.
      const winner = await findByCheckoutKey(input.checkoutKey);
      if (winner) return reuse(winner, userId);
    }
    throw error;
  }

  if (result.kind === "reused") {
    const order = await findByCheckoutKey(input.checkoutKey);
    return reuse(order!, userId);
  }

  if (result.status === "CONFIRMED") {
    await safeNotify(result.orderId);
    return { ok: true, orderId: result.orderId, code: result.code, status: result.status, redirectUrl: resultPath(result.code), reused: false };
  }

  // Pasarela: fuera de la transacción (una llamada de red no debe retener bloqueos).
  try {
    const provider = getPaymentProvider(gatewayKind);
    const checkout = await provider.createCheckout({
      paymentId: result.paymentId,
      amount: result.gatewayAmount,
      description: `Pedido ${result.code} · ${restaurant.name}`,
      customerEmail: user.email,
      returnUrl: `${appUrl()}${resultPath(result.code)}`,
    });
    await db.payment.update({
      where: { id: result.paymentId },
      data: { providerRef: checkout.providerRef, checkoutUrl: checkout.redirectUrl },
    });
    return { ok: true, orderId: result.orderId, code: result.code, status: result.status, redirectUrl: checkout.redirectUrl, reused: false };
  } catch (error) {
    console.error("No se pudo iniciar el pago", error);
    await abandonCheckout(result.orderId, result.paymentId, "No se pudo iniciar el pago con la pasarela.");
    return { ok: false, error: "No pudimos iniciar el pago. Probá de nuevo en unos minutos." };
  }
}

/** Saldo comprometido por pagos mixtos todavía vigentes (se debita al aprobarse). */
export async function reservedWalletAmount(tx: Tx, userId: string, now: Date, excludePaymentId?: string): Promise<number> {
  const agg = await tx.payment.aggregate({
    where: {
      customerId: userId,
      status: "PENDING",
      walletAmount: { gt: 0 },
      expiresAt: { gt: now },
      ...(excludePaymentId ? { id: { not: excludePaymentId } } : {}),
    },
    _sum: { walletAmount: true },
  });
  return agg._sum.walletAmount ?? 0;
}

async function uniqueCode(tx: Tx): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = generateOrderCode();
    if (!(await tx.order.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
  throw new Error("No se pudo generar un código de pedido único");
}

async function findByCheckoutKey(checkoutKey: CheckoutInput["checkoutKey"]) {
  return db.order.findUnique({
    where: { checkoutKey },
    select: {
      id: true,
      code: true,
      status: true,
      customerId: true,
      holdExpiresAt: true,
      payments: { select: { status: true, checkoutUrl: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
}

function reuse(order: NonNullable<Awaited<ReturnType<typeof findByCheckoutKey>>>, userId: string): PlaceOrderResult {
  if (order.customerId !== userId) return { ok: false, error: "No pudimos procesar el pedido. Recargá la página." };
  const payment = order.payments[0];
  const payable = order.status === "PENDING_PAYMENT" && payment?.status === "PENDING" && payment.checkoutUrl;
  return {
    ok: true,
    orderId: order.id,
    code: order.code,
    status: order.status,
    redirectUrl: payable ? payment.checkoutUrl! : resultPath(order.code),
    reused: true,
  };
}

/** Libera la reserva si no se pudo abrir la pasarela. */
async function abandonCheckout(orderId: string, paymentId: string, reason: string) {
  await db.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: { id: orderId, status: "PENDING_PAYMENT" },
      data: { status: "PAYMENT_FAILED", cancelReason: reason },
    });
    if (updated.count > 0) {
      await tx.orderStatusEvent.create({ data: { orderId, fromStatus: "PENDING_PAYMENT", toStatus: "PAYMENT_FAILED", reason } });
    }
    await tx.payment.updateMany({ where: { id: paymentId, status: "PENDING" }, data: { status: "CANCELLED", failureReason: reason } });
  });
}

export async function safeNotify(orderId: string) {
  try {
    await notify({ type: "ORDER_CONFIRMED", orderId });
  } catch (error) {
    console.error("notify ORDER_CONFIRMED falló", error);
  }
}
