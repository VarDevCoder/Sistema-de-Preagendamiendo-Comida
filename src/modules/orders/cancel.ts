import "server-only";
import { db } from "@/lib/db";
import { notify } from "@/modules/notifications/events";
import { applyBps, formatGs } from "@/modules/shared/money";
import { partialRefundEntries } from "@/modules/wallet/entries";
import { postLedgerTransaction } from "@/modules/wallet/ledger-tx";
import { TX_OPTIONS } from "./checkout";
import { customerCancelCheck } from "./rules";

// Cancelación de un pedido suelto por el cliente (D-2, RF-C12): hasta la hora
// de corte, con reembolso a la billetera del % que define el restaurante.
// Idempotente: el pedido se bloquea y el asiento tiene clave única por pedido.

export type CancelResult =
  | { ok: true; alreadyCancelled: boolean; refundAmount: number; message: string }
  | { ok: false; error: string };

export async function cancelOrderByCustomer(userId: string, code: string, reason?: string, now: Date = new Date()): Promise<CancelResult> {
  const result = await db.$transaction(async (tx) => {
    const found = await tx.order.findUnique({ where: { code }, select: { id: true, customerId: true } });
    if (!found || found.customerId !== userId) return { ok: false as const, error: "No encontramos ese pedido." };
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${found.id} FOR UPDATE`;
    const order = await tx.order.findUniqueOrThrow({
      where: { id: found.id },
      include: { restaurant: { select: { customerCancelRefundBps: true } } },
    });
    if (order.status === "CANCELLED_BY_CUSTOMER") {
      return { ok: true as const, alreadyCancelled: true, refundAmount: 0, message: "El pedido ya estaba cancelado.", ledgerTxId: null };
    }
    const check = customerCancelCheck(order, now);
    if (!check.ok) return { ok: false as const, error: check.error };

    const text = reason?.trim().slice(0, 200) || "Cancelado por el cliente";
    let refundAmount = 0;
    let ledgerTxId: string | null = null;
    if (order.status === "CONFIRMED") {
      refundAmount = applyBps(order.total, order.restaurant.customerCancelRefundBps);
      if (refundAmount > 0) {
        const ltx = await postLedgerTransaction(tx, {
          type: "REFUND_TO_WALLET",
          description: `Cancelación del cliente · pedido ${order.code}`,
          idempotencyKey: `order:${order.id}:customer-cancel`,
          orderId: order.id,
          createdById: userId,
          entries: partialRefundEntries({
            userId,
            restaurantId: order.restaurantId,
            total: order.total,
            commissionAmount: order.commissionAmount,
            refundAmount,
          }),
        });
        ledgerTxId = ltx.id;
      }
    } else {
      // Reserva sin pagar: se libera el cupo y se cancela el pago pendiente.
      await tx.payment.updateMany({
        where: { orderId: order.id, status: "PENDING" },
        data: { status: "CANCELLED", failureReason: "El cliente canceló el pedido" },
      });
    }
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: "CANCELLED_BY_CUSTOMER",
        cancelledAt: now,
        cancelReason: text,
        events: { create: { fromStatus: order.status, toStatus: "CANCELLED_BY_CUSTOMER", actorId: userId, reason: text, createdAt: now } },
      },
    });
    return {
      ok: true as const,
      alreadyCancelled: false,
      refundAmount,
      message: refundAmount > 0 ? `Pedido cancelado. Te devolvimos ${formatGs(refundAmount)} a tu billetera.` : "Pedido cancelado.",
      ledgerTxId,
      orderId: order.id,
    };
  }, TX_OPTIONS);

  if (result.ok && !result.alreadyCancelled && "orderId" in result) {
    try {
      await notify({ type: "ORDER_CANCELLED", orderId: result.orderId! });
      if (result.ledgerTxId) {
        await notify({ type: "WALLET_CREDITED", userId, amount: result.refundAmount, ledgerTransactionId: result.ledgerTxId });
      }
    } catch (error) {
      console.error("notify de cancelación falló", error);
    }
  }
  if (!result.ok) return result;
  return { ok: true, alreadyCancelled: result.alreadyCancelled, refundAmount: result.refundAmount, message: result.message };
}
