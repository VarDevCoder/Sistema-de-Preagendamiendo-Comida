// Punto de integración de notificaciones (email + web push + in-app).
// Las fases 4–7 llaman a `notify` DESPUÉS de confirmar la transacción;
// la Fase 8 implementa el envío (deduplicado con Notification.dedupeKey).
// Nunca debe lanzar: una falla al notificar no puede romper un pedido o un pago.

export type NotificationEvent =
  | { type: "ORDER_CONFIRMED"; orderId: string }
  | { type: "ORDER_READY"; orderId: string }
  | { type: "ORDER_CANCELLED"; orderId: string }
  | { type: "PLAN_CONFIRMED"; subscriptionId: string }
  | { type: "PLAN_DAY_CHANGED"; orderId: string }
  | { type: "WALLET_CREDITED"; userId: string; amount: number; ledgerTransactionId: string }
  | { type: "CLAIM_UPDATED"; claimId: string };

export async function notify(event: NotificationEvent): Promise<void> {
  void event; // Implementación en Fase 8.
}
