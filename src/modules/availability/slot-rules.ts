import type { SlotScope } from "@/generated/prisma/enums";
import { formatMinute } from "@/modules/shared/time";

// Reglas puras de franjas horarias (plantillas y franjas por fecha).

export const SLOT_SCOPE_LABEL: Record<SlotScope, string> = {
  PICKUP: "Solo retiro",
  DELIVERY: "Solo delivery",
  BOTH: "Retiro y delivery",
};

export type SlotLike = {
  id?: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
  scope: SlotScope;
  isActive?: boolean;
};

/** Dos franjas compiten por los mismos pedidos si alguna es BOTH o tienen el mismo alcance. */
export function scopesConflict(a: SlotScope, b: SlotScope): boolean {
  return a === "BOTH" || b === "BOTH" || a === b;
}

/** Rangos [inicio, fin) que se pisan. 12:00–12:30 y 12:30–13:00 NO se pisan. */
export function rangesOverlap(a: { startMinute: number; endMinute: number }, b: { startMinute: number; endMinute: number }) {
  return a.startMinute < b.endMinute && b.startMinute < a.endMinute;
}

/**
 * Busca una plantilla ACTIVA del mismo día que se solape con la candidata y
 * compita por el mismo alcance (retiro/delivery). Ignora la propia (mismo id).
 * Así un cliente nunca ve dos franjas superpuestas para la misma modalidad.
 */
export function findSlotOverlap<T extends SlotLike>(candidate: SlotLike, existing: T[]): T | null {
  for (const e of existing) {
    if (candidate.id && e.id === candidate.id) continue;
    if (e.isActive === false) continue;
    if (e.weekday !== candidate.weekday) continue;
    if (!scopesConflict(e.scope, candidate.scope)) continue;
    if (rangesOverlap(e, candidate)) return e;
  }
  return null;
}

export function describeSlot(s: { startMinute: number; endMinute: number }): string {
  return `${formatMinute(s.startMinute)}–${formatMinute(s.endMinute)}`;
}

/** No se puede bajar el cupo por debajo de los pedidos que ya lo ocupan. */
export function capacityError(capacity: number, occupied: number): string | null {
  if (capacity >= occupied) return null;
  return `Ya hay ${occupied} pedido(s) en esta franja: el cupo no puede ser menor.`;
}
