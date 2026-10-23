import type { DateKey } from "@/modules/shared/time";

// Reglas puras de stock diario (platos y opciones).

/**
 * Cuando cambia un valor por defecto (stock de la plantilla semanal de un plato
 * o `dailyStock` de una opción), las filas YA materializadas de días futuros
 * se actualizan solo si:
 *  - el día es posterior a hoy,
 *  - no hay pedidos que retengan stock ese día (pagos o reservas vigentes),
 *  - y la fila todavía tiene el valor anterior (no la editó el restaurante a mano).
 */
export function shouldPropagateDefault(row: {
  date: DateKey;
  today: DateKey;
  currentValue: number;
  previousDefault: number;
  holdingQty: number;
}): boolean {
  return row.date > row.today && row.currentValue === row.previousDefault && row.holdingQty === 0;
}

/** No se puede bajar el stock de un día por debajo de lo ya vendido/reservado. */
export function stockBelowUsedError(stock: number, used: number): string | null {
  if (stock >= used) return null;
  return `Ya hay ${used} vendido(s) o reservado(s) ese día: el stock no puede ser menor.`;
}

export type ScheduleEntry = { weekday: number; defaultStock: number };

export type ScheduleDiff = {
  added: ScheduleEntry[];
  removed: ScheduleEntry[];
  changed: { weekday: number; from: number; to: number }[];
};

/** Diferencia entre la plantilla semanal actual y la nueva de un plato. */
export function diffSchedule(previous: ScheduleEntry[], next: ScheduleEntry[]): ScheduleDiff {
  const prev = new Map(previous.map((e) => [e.weekday, e.defaultStock]));
  const nxt = new Map(next.map((e) => [e.weekday, e.defaultStock]));
  const diff: ScheduleDiff = { added: [], removed: [], changed: [] };
  for (const [weekday, defaultStock] of nxt) {
    const before = prev.get(weekday);
    if (before === undefined) diff.added.push({ weekday, defaultStock });
    else if (before !== defaultStock) diff.changed.push({ weekday, from: before, to: defaultStock });
  }
  for (const [weekday, defaultStock] of prev) if (!nxt.has(weekday)) diff.removed.push({ weekday, defaultStock });
  const byDay = <T extends { weekday: number }>(a: T, b: T) => a.weekday - b.weekday;
  diff.added.sort(byDay);
  diff.removed.sort(byDay);
  diff.changed.sort(byDay);
  return diff;
}
