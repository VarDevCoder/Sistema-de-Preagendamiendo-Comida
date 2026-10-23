import { formatMinute } from "@/modules/shared/time";

// Reglas puras de la configuración del restaurante (sin base de datos).

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** Filas del formulario de escalones de anticipación. */
export const MAX_TIER_ROWS = 6;

export const WEEKDAY_LABEL: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  7: "Domingo",
};

export const WEEKDAY_SHORT: Record<number, string> = { 1: "Lun", 2: "Mar", 3: "Mié", 4: "Jue", 5: "Vie", 6: "Sáb", 7: "Dom" };
export const WEEKDAY_LETTER: Record<number, string> = { 1: "L", 2: "M", 3: "M", 4: "J", 5: "V", 6: "S", 7: "D" };

/** "El día anterior a las 20:00" */
export function describeCutoff(daysBefore: number, minute: number): string {
  const at = `a las ${formatMinute(minute)}`;
  if (daysBefore === 0) return `El mismo día ${at}`;
  if (daysBefore === 1) return `El día anterior ${at}`;
  return `${daysBefore} días antes ${at}`;
}

/** "Lun a Vie", "Lun, Mié y Vie", "Todos los días" */
export function describeWeekdays(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 0) return "Ningún día";
  if (sorted.length === 7) return "Todos los días";
  const consecutive = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (consecutive && sorted.length >= 3) return `${WEEKDAY_SHORT[sorted[0]]} a ${WEEKDAY_SHORT[sorted.at(-1)!]}`;
  const names = sorted.map((d) => WEEKDAY_SHORT[d]);
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} y ${names.at(-1)}`;
}

export type TierInput = { minHoursBefore: number; discountBps: number };

/**
 * Escalones de descuento por anticipación: sin horas repetidas y con descuento
 * que no baja al pedir con más anticipación (si no, conviene pedir más tarde).
 * Devuelve el mensaje de error o null.
 */
export function validateTiers(tiers: TierInput[]): string | null {
  const sorted = [...tiers].sort((a, b) => a.minHoursBefore - b.minHoursBefore);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].minHoursBefore === sorted[i - 1].minHoursBefore) {
      return `Hay dos escalones con ${sorted[i].minHoursBefore} h de anticipación.`;
    }
    if (sorted[i].discountBps < sorted[i - 1].discountBps) {
      return "Un escalón con más anticipación no puede tener menos descuento que uno con menos anticipación.";
    }
  }
  return null;
}

/**
 * Plan mensual: con N días por semana, cualquier mes tiene al menos 4·N días
 * del plan. Si minDays supera eso, nadie podría suscribirse algunos meses.
 */
export function maxGuaranteedPlanDays(weekdays: number[]): number {
  return new Set(weekdays).size * 4;
}
