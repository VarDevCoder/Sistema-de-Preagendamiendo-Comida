import type { OrderStatus } from "@/generated/prisma/enums";
import type { DateKey } from "@/modules/shared/time";

// Reglas puras de la gestión de pedidos del día por parte del restaurante.

/** Flujo de cocina: un paso por vez, sin saltos ni retrocesos. */
const NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  CONFIRMED: "IN_PREPARATION",
  IN_PREPARATION: "READY",
  READY: "DELIVERED",
};

export type KitchenStatus = "IN_PREPARATION" | "READY" | "DELIVERED";

export const KITCHEN_ACTION_LABEL: Record<KitchenStatus, string> = {
  IN_PREPARATION: "En preparación",
  READY: "Listo",
  DELIVERED: "Entregado",
};

export function nextKitchenStatus(from: OrderStatus): KitchenStatus | null {
  return (NEXT[from] as KitchenStatus | undefined) ?? null;
}

export function canAdvance(from: OrderStatus, to: OrderStatus): boolean {
  return NEXT[from] === to;
}

/** Estados en los que el restaurante todavía puede cancelar (y reembolsar). */
export const RESTAURANT_CANCELLABLE = ["CONFIRMED", "IN_PREPARATION", "READY"] as const satisfies OrderStatus[];

export function canRestaurantCancel(status: OrderStatus): boolean {
  return (RESTAURANT_CANCELLABLE as readonly OrderStatus[]).includes(status);
}

/** Columna de timestamp que se completa al llegar a cada estado. */
export function timestampFieldFor(to: KitchenStatus): "inPreparationAt" | "readyAt" | "deliveredAt" {
  return to === "IN_PREPARATION" ? "inPreparationAt" : to === "READY" ? "readyAt" : "deliveredAt";
}

/** No se avanza la preparación de un pedido de un día futuro (sí de hoy o atrasados). */
export function canAdvanceOnDate(serviceDate: DateKey, today: DateKey): boolean {
  return serviceDate <= today;
}

export type AdvanceDecision =
  | { ok: true; noop: boolean }
  | { ok: false; error: string };

/**
 * Decide si se puede pasar `from` → `to`. Repetir la misma acción (doble click,
 * reintento) no es error: es un no-op.
 */
export function decideAdvance(p: { from: OrderStatus; to: KitchenStatus; serviceDate: DateKey; today: DateKey }): AdvanceDecision {
  if (p.from === p.to) return { ok: true, noop: true };
  if (!canAdvanceOnDate(p.serviceDate, p.today)) {
    return { ok: false, error: "Solo se pueden preparar pedidos de hoy." };
  }
  if (!canAdvance(p.from, p.to)) {
    return { ok: false, error: "Ese cambio de estado no es válido para este pedido." };
  }
  return { ok: true, noop: false };
}

export const CANCEL_REASON_MIN = 5;
export const CANCEL_REASON_MAX = 300;
