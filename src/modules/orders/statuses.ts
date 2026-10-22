import type { OrderStatus } from "@/generated/prisma/enums";

/** Estados que ya están pagos y ocupan cupo/stock de forma definitiva. */
export const PAID_ACTIVE_STATUSES = ["CONFIRMED", "IN_PREPARATION", "READY", "DELIVERED"] as const satisfies OrderStatus[];

/**
 * Un pedido RETIENE cupo y stock si está pago (PAID_ACTIVE_STATUSES) o si está
 * PENDING_PAYMENT con holdExpiresAt > now(). Una reserva vencida deja de
 * contar sola, sin depender de un cron. Usar SIEMPRE esta condición al contar.
 */
export const HOLDING_CONDITION_SQL = `("status" IN ('CONFIRMED','IN_PREPARATION','READY','DELIVERED') OR ("status" = 'PENDING_PAYMENT' AND "holdExpiresAt" > now()))`;

/** Filtro equivalente para Prisma (para lecturas fuera de transacciones con lock). */
export function holdingWhere(now: Date = new Date()) {
  return {
    OR: [
      { status: { in: [...PAID_ACTIVE_STATUSES] } },
      { status: "PENDING_PAYMENT" as const, holdExpiresAt: { gt: now } },
    ],
  };
}
