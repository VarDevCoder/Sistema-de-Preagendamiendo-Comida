// Punto de integración de notificaciones (email + web push + in-app).
// Las fases 4–7 llaman a `notify` DESPUÉS de confirmar la transacción.
// Cada hecho se notifica una sola vez por canal (Notification.dedupeKey).
// Nunca lanza: una falla al notificar no puede romper un pedido o un pago.

import { after } from "next/server";

export type NotificationEvent =
  | { type: "ORDER_CONFIRMED"; orderId: string }
  | { type: "ORDER_READY"; orderId: string }
  | { type: "ORDER_CANCELLED"; orderId: string }
  | { type: "PLAN_CONFIRMED"; subscriptionId: string }
  | { type: "PLAN_DAY_CHANGED"; orderId: string }
  | { type: "WALLET_CREDITED"; userId: string; amount: number; ledgerTransactionId: string }
  | { type: "CLAIM_UPDATED"; claimId: string }
  // Lo dispara el cron /api/cron/recordatorios (día anterior al servicio).
  | { type: "ORDER_REMINDER"; orderId: string };

async function deliverSafely(event: NotificationEvent): Promise<void> {
  try {
    // Import diferido: quien solo importa los tipos no carga Prisma ni los proveedores.
    const { deliverNotification } = await import("./service");
    await deliverNotification(event);
  } catch (err) {
    console.error(`[notificaciones] No se pudo notificar ${event.type}`, err);
  }
}

/**
 * Notifica un evento al cliente correspondiente.
 * - Dentro de una request (server action, route handler) el envío se agenda con
 *   `after()` y corre después de responder: no demora al usuario.
 * - Fuera de una request (scripts, tests) se envía en el momento y se espera.
 */
export async function notify(event: NotificationEvent): Promise<void> {
  try {
    after(() => deliverSafely(event));
    return;
  } catch {
    // `after` lanza fuera del contexto de una request: seguimos en línea.
  }
  await deliverSafely(event);
}
