import "server-only";
import { db } from "@/lib/db";

// Limpieza de reservas vencidas (cron diario). NO es necesaria para la
// correctitud: una reserva vencida ya no cuenta en el cupo (HOLDING_CONDITION_SQL).
// Idempotente: correrlo dos veces no cambia nada la segunda vez.

export async function expireStaleReservations(now: Date = new Date()) {
  return db.$transaction(async (tx) => {
    // UPDATE … RETURNING bloquea cada fila; si un webhook la está confirmando,
    // espera y vuelve a evaluar el WHERE con el estado nuevo (no la pisa).
    const expired = await tx.$queryRaw<{ id: string }[]>`
      UPDATE "Order" SET "status" = 'EXPIRED', "updatedAt" = ${now}
      WHERE "status" = 'PENDING_PAYMENT' AND "holdExpiresAt" <= ${now}
      RETURNING "id"`;
    if (expired.length > 0) {
      await tx.orderStatusEvent.createMany({
        data: expired.map((o) => ({ orderId: o.id, fromStatus: "PENDING_PAYMENT" as const, toStatus: "EXPIRED" as const, reason: "No se pagó a tiempo", createdAt: now })),
      });
    }
    const payments = await tx.payment.updateMany({
      where: { status: "PENDING", expiresAt: { lte: now } },
      data: { status: "EXPIRED", failureReason: "Venció el tiempo para pagar" },
    });
    return { expiredOrders: expired.length, expiredPayments: payments.count };
  });
}
