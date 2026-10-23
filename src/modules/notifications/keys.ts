import type { ClaimStatus, NotificationChannel } from "@/generated/prisma/enums";
import type { NotificationEvent } from "./events";

// Claves de deduplicación. Notification.dedupeKey es UNIQUE: la misma
// notificación (hecho + canal) se inserta una sola vez aunque `notify` se
// llame dos veces (reintentos, cron repetido, doble click).

/** Datos de la base que algunos eventos necesitan para identificar el hecho. */
export type EventKeyExtra = {
  /** PLAN_DAY_CHANGED: id del OrderChange más reciente (cada cambio es un hecho distinto). */
  orderChangeId?: string | null;
  /** PLAN_DAY_CHANGED sin OrderChange (ej. pausa): versión del pedido. */
  orderVersion?: number;
  /** CLAIM_UPDATED: cada estado del reclamo se avisa una vez. */
  claimStatus?: ClaimStatus;
};

/** Identificador determinístico del hecho que se notifica (sin canal). */
export function eventKey(event: NotificationEvent, extra: EventKeyExtra = {}): string {
  switch (event.type) {
    case "ORDER_CONFIRMED":
    case "ORDER_REMINDER":
    case "ORDER_READY":
    case "ORDER_CANCELLED":
      return `${event.type}:${event.orderId}`;
    case "PLAN_CONFIRMED":
      return `${event.type}:${event.subscriptionId}`;
    case "PLAN_DAY_CHANGED":
      if (extra.orderChangeId) return `${event.type}:${event.orderId}:${extra.orderChangeId}`;
      return `${event.type}:${event.orderId}:v${extra.orderVersion ?? 0}`;
    case "WALLET_CREDITED":
      return `${event.type}:${event.ledgerTransactionId}`;
    case "CLAIM_UPDATED":
      return `${event.type}:${event.claimId}:${extra.claimStatus ?? "OPEN"}`;
  }
}

/** "ORDER_CONFIRMED:<orderId>:EMAIL" */
export function dedupeKey(key: string, channel: NotificationChannel): string {
  return `${key}:${channel}`;
}
