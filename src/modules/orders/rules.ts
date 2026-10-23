import type { OrderKind, OrderStatus } from "@/generated/prisma/enums";
import { formatInstant } from "@/modules/availability/dates";

// Reglas puras sobre pedidos ya creados (se usan en el servidor y en la UI).

export type CancelCheck = { ok: true } | { ok: false; error: string };

/** El cliente puede cancelar un pedido suelto confirmado (o sin pagar) hasta la hora de corte. */
export function customerCancelCheck(
  order: { kind: OrderKind; status: OrderStatus; cutoffAt: Date },
  now: Date,
): CancelCheck {
  if (order.kind !== "SINGLE") return { ok: false, error: "Los días del plan mensual se gestionan desde tu plan." };
  if (order.status !== "CONFIRMED" && order.status !== "PENDING_PAYMENT") {
    return { ok: false, error: "Este pedido ya no se puede cancelar." };
  }
  if (now.getTime() >= order.cutoffAt.getTime()) {
    return { ok: false, error: `Ya pasó la hora de corte (${formatInstant(order.cutoffAt)}).` };
  }
  return { ok: true };
}

/** ¿La reserva sigue vigente esperando el pago? */
export function isAwaitingPayment(order: { status: OrderStatus; holdExpiresAt: Date | null }, now: Date): boolean {
  return order.status === "PENDING_PAYMENT" && order.holdExpiresAt !== null && order.holdExpiresAt.getTime() > now.getTime();
}

/** Estado "visible": un PENDING_PAYMENT vencido se muestra como vencido aunque el cron no haya pasado. */
export function effectiveStatus(order: { status: OrderStatus; holdExpiresAt: Date | null }, now: Date): OrderStatus {
  if (order.status === "PENDING_PAYMENT" && !isAwaitingPayment(order, now)) return "EXPIRED";
  return order.status;
}
