import "server-only";
import type { OrderStatus, PaymentProviderKind } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import type { Tx } from "@/lib/db-types";
import { ensureDayMaterialized } from "@/modules/availability/materialize";
import { safeNotify, TX_OPTIONS } from "@/modules/orders/checkout";
import { decideApproval } from "@/modules/orders/payment-decision";
import { ReservationError, reserveCapacity } from "@/modules/orders/reservation";
import { dbDateToKey, formatMinute } from "@/modules/shared/time";
import { formatGs } from "@/modules/shared/money";
import { accounts } from "@/modules/wallet/accounts";
import { paymentCapturedEntries } from "@/modules/wallet/entries";
import { lockWalletBalance, postLedgerTransaction } from "@/modules/wallet/ledger-tx";
import type { PaymentEvent } from "./types";

// Procesamiento idempotente de eventos de pago (RN-6).
// 1) Se inserta PaymentWebhookEvent (único por provider+eventId): si ya existía, no se hace nada.
// 2) Se bloquean Order → Payment (y, al aprobar, franja → platos → opciones → billetera).
// 3) Todo en UNA transacción: si algo falla, el evento no queda registrado y el reintento vuelve a procesarlo.

export type ProcessOutcome =
  | "DUPLICATE"
  | "UNKNOWN_PAYMENT"
  | "AMOUNT_MISMATCH"
  | "ALREADY_FINAL"
  | "CONFIRMED"
  | "REFUNDED_NO_ROOM"
  | "REFUNDED_WALLET_SHORT"
  | "REFUNDED_NOT_PAYABLE"
  | "REJECTED";

export type ProcessResult = { outcome: ProcessOutcome; orderId?: string; paymentId?: string; message?: string };

const PAYABLE_ORDER: OrderStatus[] = ["PENDING_PAYMENT", "EXPIRED"];

export async function processPaymentEvent(provider: PaymentProviderKind, event: PaymentEvent, now: Date = new Date()): Promise<ProcessResult> {
  const result = await db.$transaction(async (tx): Promise<ProcessResult> => {
    const inserted = await tx.$queryRaw<{ id: string }[]>`
      INSERT INTO "PaymentWebhookEvent" ("id", "provider", "eventId", "type", "payload", "receivedAt")
      VALUES (gen_random_uuid()::text, ${provider}::"PaymentProviderKind", ${event.eventId}, ${event.type}, ${JSON.stringify(event.raw ?? null)}::jsonb, ${now})
      ON CONFLICT ("provider", "eventId") DO NOTHING
      RETURNING "id"`;
    if (inserted.length === 0) return { outcome: "DUPLICATE" };
    const eventRowId = inserted[0].id;
    const finish = async (r: ProcessResult): Promise<ProcessResult> => {
      await tx.paymentWebhookEvent.update({
        where: { id: eventRowId },
        data: { processedAt: now, paymentId: r.paymentId ?? null, error: r.outcome === "UNKNOWN_PAYMENT" || r.outcome === "AMOUNT_MISMATCH" ? r.message : null },
      });
      return r;
    };

    const found = await tx.payment.findUnique({
      where: { provider_providerRef: { provider, providerRef: event.providerRef } },
      select: { id: true, orderId: true },
    });
    if (!found) return finish({ outcome: "UNKNOWN_PAYMENT", message: `Pago desconocido: ${event.providerRef}` });

    // Orden de bloqueo: pedido → pago (igual que la cancelación y el cron).
    if (found.orderId) await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${found.orderId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${found.id} FOR UPDATE`;
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: found.id } });
    const base = { paymentId: payment.id, orderId: payment.orderId ?? undefined };

    if (event.amount !== undefined && event.amount !== payment.gatewayAmount) {
      return finish({ ...base, outcome: "AMOUNT_MISMATCH", message: `Monto informado ${event.amount} ≠ esperado ${payment.gatewayAmount}` });
    }
    if (payment.status === "APPROVED" || (event.type === "payment.rejected" && payment.status !== "PENDING" && payment.status !== "EXPIRED")) {
      return finish({ ...base, outcome: "ALREADY_FINAL" });
    }
    if (!payment.orderId) {
      // Pagos de planes/ajustes son de otras fases; acá solo pedidos sueltos.
      return finish({ ...base, outcome: "UNKNOWN_PAYMENT", message: "El pago no corresponde a un pedido" });
    }
    const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId }, include: { items: { include: { modifiers: true } } } });

    if (event.type === "payment.rejected") {
      const reason = event.reason ?? "La pasarela rechazó el pago.";
      await tx.payment.update({ where: { id: payment.id }, data: { status: "REJECTED", failureReason: reason } });
      if (order.status === "PENDING_PAYMENT") await setOrderStatus(tx, order.id, order.status, "PAYMENT_FAILED", now, reason, { cancelReason: reason });
      return finish({ ...base, outcome: "REJECTED", message: reason });
    }

    // --- Aprobado -------------------------------------------------------------
    const orderPayable = PAYABLE_ORDER.includes(order.status) && (payment.status === "PENDING" || payment.status === "EXPIRED");
    let room: { ok: true } | { ok: false; reason: string } = { ok: true };
    if (orderPayable) room = await recheckRoom(tx, order, now);
    const walletBalance = orderPayable && room.ok && payment.walletAmount > 0 ? await lockWalletBalance(tx, order.customerId) : null;
    const decision = decideApproval({ orderPayable, room, walletAmount: payment.walletAmount, walletBalance });

    if (decision.kind === "CONFIRM") {
      await postLedgerTransaction(tx, {
        type: "PAYMENT_CAPTURED",
        description: `Pago aprobado · pedido ${order.code}`,
        idempotencyKey: `payment:${payment.id}:captured`,
        paymentId: payment.id,
        orderId: order.id,
        entries: paymentCapturedEntries({
          userId: order.customerId,
          restaurantId: order.restaurantId,
          gatewayAmount: payment.gatewayAmount,
          walletAmount: payment.walletAmount,
          commissionAmount: order.commissionAmount,
        }),
      });
      await tx.payment.update({ where: { id: payment.id }, data: { status: "APPROVED", approvedAt: now } });
      await setOrderStatus(tx, order.id, order.status, "CONFIRMED", now, order.status === "EXPIRED" ? "Pago aprobado después del vencimiento de la reserva" : "Pago aprobado", {
        confirmedAt: now,
      });
      return finish({ ...base, outcome: "CONFIRMED" });
    }

    // No se puede cumplir: lo cobrado por la pasarela se acredita en la billetera
    // (no se puede retirar, D-3). La parte de billetera nunca se llegó a debitar.
    const refundMsg = `Te acreditamos ${formatGs(payment.gatewayAmount)} en tu billetera.`;
    const message = `${decision.reason} ${refundMsg}`;
    if (payment.gatewayAmount > 0) {
      await postLedgerTransaction(tx, {
        type: "REFUND_TO_WALLET",
        description: `Pago sin pedido · ${order.code}`,
        idempotencyKey: `payment:${payment.id}:unfulfilled-refund`,
        paymentId: payment.id,
        orderId: order.id,
        entries: [
          { account: accounts.gateway, amount: payment.gatewayAmount },
          { account: accounts.wallet(order.customerId), amount: -payment.gatewayAmount },
        ],
      });
    }
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "APPROVED",
        approvedAt: now,
        amount: payment.gatewayAmount,
        walletAmount: 0,
        failureReason: message,
        metadata: { unfulfilled: decision.kind, originalWalletAmount: payment.walletAmount, originalAmount: payment.amount },
      },
    });
    const target: OrderStatus | null =
      decision.kind === "REFUND_WALLET_SHORT" ? "PAYMENT_FAILED" : decision.kind === "REFUND_NO_ROOM" ? "EXPIRED" : null;
    if (target && order.status !== target) {
      await setOrderStatus(tx, order.id, order.status, target, now, message, { cancelReason: message, cancelledAt: now });
    } else if (target) {
      await tx.order.update({ where: { id: order.id }, data: { cancelReason: message, cancelledAt: now } });
    }
    const outcome: ProcessOutcome =
      decision.kind === "REFUND_NO_ROOM" ? "REFUNDED_NO_ROOM" : decision.kind === "REFUND_WALLET_SHORT" ? "REFUNDED_WALLET_SHORT" : "REFUNDED_NOT_PAYABLE";
    return finish({ ...base, outcome, message });
  }, TX_OPTIONS);

  if (result.outcome === "CONFIRMED" && result.orderId) await safeNotify(result.orderId);
  return result;
}

type OrderWithItems = {
  id: string;
  restaurantId: string;
  serviceDate: Date;
  slotId: string;
  slotStartMinute: number;
  fulfillment: "PICKUP" | "DELIVERY";
  holdExpiresAt: Date | null;
  cutoffAt: Date;
  items: { dishId: string; dishName: string; quantity: number; modifiers: { optionId: string; optionName: string }[] }[];
};

/**
 * Vuelve a verificar cupo y stock con bloqueos, sin contarse a sí mismo.
 * Se hace SIEMPRE (no solo si la reserva venció): así nunca se confirma un
 * pedido cuyo lugar ya tomó otro cliente después del vencimiento.
 */
async function recheckRoom(tx: Tx, order: OrderWithItems, now: Date): Promise<{ ok: true } | { ok: false; reason: string }> {
  const holdValid = order.holdExpiresAt !== null && order.holdExpiresAt.getTime() > now.getTime();
  if (!holdValid && now.getTime() >= order.cutoffAt.getTime()) {
    return { ok: false, reason: "La reserva venció y ya pasó la hora de corte de ese día." };
  }
  const date = dbDateToKey(order.serviceDate);
  const limited = await tx.modifierOption.findMany({
    where: { id: { in: order.items.flatMap((i) => i.modifiers.map((m) => m.optionId)) }, dailyStock: { not: null } },
    select: { id: true, name: true },
  });
  try {
    await ensureDayMaterialized(tx, order.restaurantId, date);
    await reserveCapacity(tx, {
      restaurantId: order.restaurantId,
      date,
      slotId: order.slotId,
      fulfillment: order.fulfillment,
      items: order.items.map((i) => ({ dishId: i.dishId, dishName: i.dishName, quantity: i.quantity, optionIds: i.modifiers.map((m) => m.optionId) })),
      limitedOptions: new Map(limited.map((o) => [o.id, o.name])),
      excludeOrderId: order.id,
      // La franja ya empezada solo invalida si la reserva había vencido.
      now: holdValid ? new Date(0) : now,
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof ReservationError) {
      const why = `${error.message.replace(/\.$/, "")}; franja de las ${formatMinute(order.slotStartMinute)}`;
      return {
        ok: false,
        reason: holdValid
          ? `Tu pago se aprobó, pero ya no queda lugar (${why}).`
          : `Tu pago se aprobó, pero la reserva había vencido y ya no queda lugar (${why}).`,
      };
    }
    throw error;
  }
}

async function setOrderStatus(
  tx: Tx,
  orderId: string,
  from: OrderStatus,
  to: OrderStatus,
  now: Date,
  reason: string | null,
  extra: { confirmedAt?: Date; cancelledAt?: Date; cancelReason?: string } = {},
) {
  await tx.order.update({
    where: { id: orderId },
    data: { status: to, ...extra, events: { create: { fromStatus: from, toStatus: to, reason, createdAt: now } } },
  });
}
