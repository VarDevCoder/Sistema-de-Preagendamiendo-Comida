import "server-only";
import { db } from "@/lib/db";
import type { Tx } from "@/lib/db-types";
import type { OrderStatus } from "@/generated/prisma/enums";
import { notify } from "@/modules/notifications/events";
import { todayKey } from "@/modules/shared/time";
import { restaurantCancelEntries } from "@/modules/wallet/entries";
import { postLedgerTransaction } from "@/modules/wallet/ledger-tx";
import { canRestaurantCancel, decideAdvance, timestampFieldFor, type KitchenStatus } from "./restaurant-transitions";

// Operaciones del restaurante sobre pedidos. Quien llama ya autorizó que el
// usuario administra `restaurantId`; acá se verifica que el pedido sea de ese
// restaurante y se bloquea la fila del pedido para serializar cambios
// concurrentes (dos pantallas de cocina, cancelación del cliente, etc.).

export type CommandResult = { ok: true; noop?: boolean } | { ok: false; error: string };

type LockedOrder = { id: string; status: OrderStatus; serviceDate: string };

async function lockOrder(tx: Tx, orderId: string, restaurantId: string) {
  // serviceDate como texto (DateKey) para no depender de cómo el driver convierte DATE.
  const rows = await tx.$queryRaw<LockedOrder[]>`
    SELECT id, status::text AS status, "serviceDate"::text AS "serviceDate" FROM "Order"
    WHERE id = ${orderId} AND "restaurantId" = ${restaurantId}
    FOR UPDATE`;
  return rows[0] ?? null;
}

export async function advanceOrderStatus(p: {
  restaurantId: string;
  orderId: string;
  to: KitchenStatus;
  actorId: string;
  now?: Date;
}): Promise<CommandResult> {
  const now = p.now ?? new Date();
  const result = await db.$transaction(async (tx): Promise<CommandResult> => {
    const order = await lockOrder(tx, p.orderId, p.restaurantId);
    if (!order) return { ok: false, error: "No encontramos ese pedido." };
    const decision = decideAdvance({ from: order.status, to: p.to, serviceDate: order.serviceDate, today: todayKey(now) });
    if (!decision.ok) return decision;
    if (decision.noop) return { ok: true, noop: true };
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: p.to,
        [timestampFieldFor(p.to)]: now,
        events: { create: { fromStatus: order.status, toStatus: p.to, actorId: p.actorId, createdAt: now } },
      },
    });
    return { ok: true };
  });
  // Notificar solo después de confirmar la transacción (notify nunca lanza).
  if (result.ok && !result.noop && p.to === "READY") await notify({ type: "ORDER_READY", orderId: p.orderId });
  return result;
}

/**
 * Cancelación por el restaurante (D-1): el cliente recibe el 100% del total del
 * pedido en la billetera (para un día de plan, el valor de ese día). Quién
 * absorbe el costo sale de la política VIGENTE del restaurante al cancelar.
 * Idempotente: cancelar dos veces no duplica el reembolso (estado + idempotencyKey).
 */
export async function cancelOrderByRestaurant(p: {
  restaurantId: string;
  orderId: string;
  reason: string;
  actorId: string;
  now?: Date;
}): Promise<CommandResult & { refunded?: number }> {
  const now = p.now ?? new Date();
  const result = await db.$transaction(async (tx): Promise<CommandResult & { refunded?: number }> => {
    const locked = await lockOrder(tx, p.orderId, p.restaurantId);
    if (!locked) return { ok: false, error: "No encontramos ese pedido." };
    if (locked.status === "CANCELLED_BY_RESTAURANT") return { ok: true, noop: true };
    if (!canRestaurantCancel(locked.status)) {
      return { ok: false, error: "Este pedido ya no se puede cancelar." };
    }

    const order = await tx.order.findUniqueOrThrow({
      where: { id: locked.id },
      select: {
        id: true,
        code: true,
        customerId: true,
        total: true,
        commissionAmount: true,
        restaurant: { select: { restaurantCancelRefundsCommission: true, restaurantCancelPenaltyBps: true } },
      },
    });

    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "CANCELLED_BY_RESTAURANT",
        cancelledAt: now,
        cancelReason: p.reason,
        events: {
          create: { fromStatus: locked.status, toStatus: "CANCELLED_BY_RESTAURANT", actorId: p.actorId, reason: p.reason, createdAt: now },
        },
      },
    });

    const entries = restaurantCancelEntries({
      userId: order.customerId,
      restaurantId: p.restaurantId,
      total: order.total,
      commissionAmount: order.commissionAmount,
      refundsCommission: order.restaurant.restaurantCancelRefundsCommission,
      penaltyBps: order.restaurant.restaurantCancelPenaltyBps,
    });
    // Un pedido de total 0 no mueve dinero (no hay asientos que registrar).
    if (entries.length >= 2) {
      await postLedgerTransaction(tx, {
        type: "REFUND_TO_WALLET",
        description: `Cancelación del restaurante · pedido ${order.code}`,
        idempotencyKey: `order:${order.id}:restaurant-cancel`,
        orderId: order.id,
        createdById: p.actorId,
        entries,
      });
    }
    return { ok: true, refunded: order.total };
  });
  if (result.ok && !result.noop) await notify({ type: "ORDER_CANCELLED", orderId: p.orderId });
  return result;
}
