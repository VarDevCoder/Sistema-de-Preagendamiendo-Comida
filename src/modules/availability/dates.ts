import type { Fulfillment, SlotScope } from "@/generated/prisma/enums";
import { addDays, cutoffInstant, diffDays, isDateKey, isoWeekday, todayKey, zonedInstant, type DateKey } from "@/modules/shared/time";

// Reglas puras de fechas y franjas para pedidos sueltos (America/Asuncion).

export type CutoffRule = { cutoffDaysBefore: number; cutoffMinute: number };

/** ¿Todavía se puede pedir para `date`? (antes de la hora de corte) */
export function isBeforeCutoff(date: DateKey, now: Date, rule: CutoffRule): boolean {
  return now.getTime() < cutoffInstant(date, rule.cutoffDaysBefore, rule.cutoffMinute).getTime();
}

export type DateCheck = { ok: true } | { ok: false; error: string };

/** Fecha pedible: hoy..hoy+maxDaysAhead y antes del corte. */
export function validateServiceDate(date: string, now: Date, rule: CutoffRule & { maxDaysAhead: number }): DateCheck {
  if (!isDateKey(date)) return { ok: false, error: "Fecha inválida." };
  const today = todayKey(now);
  const ahead = diffDays(today, date);
  if (ahead < 0) return { ok: false, error: "Esa fecha ya pasó." };
  if (ahead > rule.maxDaysAhead) return { ok: false, error: `Podés pedir hasta ${rule.maxDaysAhead} días antes.` };
  if (!isBeforeCutoff(date, now, rule)) return { ok: false, error: "Ya pasó la hora de corte para ese día." };
  return { ok: true };
}

/**
 * Días que se ofrecen en el selector: de hoy a hoy+maxDaysAhead, antes del
 * corte, que no sean feriados y que tengan franjas. Si el día ya está
 * materializado manda lo que dice la base (el restaurante puede haber
 * cerrado o agregado franjas); si no, la plantilla semanal.
 */
export function computeAvailableDates(p: CutoffRule & {
  now: Date;
  maxDaysAhead: number;
  templateWeekdays: ReadonlySet<number>;
  closures: ReadonlySet<DateKey>;
  /** día materializado → ¿tiene alguna franja abierta? */
  materialized: ReadonlyMap<DateKey, boolean>;
}): DateKey[] {
  const today = todayKey(p.now);
  const out: DateKey[] = [];
  for (let i = 0; i <= p.maxDaysAhead; i++) {
    const date = addDays(today, i);
    if (p.closures.has(date)) continue;
    if (!isBeforeCutoff(date, p.now, p)) continue;
    const known = p.materialized.get(date);
    const hasSlots = known ?? p.templateWeekdays.has(isoWeekday(date));
    if (hasSlots) out.push(date);
  }
  return out;
}

/** Una franja con alcance BOTH sirve para retiro y delivery. */
export function slotServes(scope: SlotScope, fulfillment: Fulfillment): boolean {
  return scope === "BOTH" || scope === fulfillment;
}

export type SlotLike = { startMinute: number; capacity: number; isClosed: boolean; held: number };

/** Lugares libres en una franja (0 si está cerrada o ya empezó). */
export function slotRemaining(slot: SlotLike, date: DateKey, now: Date): number {
  if (slot.isClosed) return 0;
  if (zonedInstant(date, slot.startMinute).getTime() <= now.getTime()) return 0;
  return Math.max(0, slot.capacity - slot.held);
}

const WEEKDAY_SHORT = ["", "lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const WEEKDAY_LONG = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const MONTH_SHORT = ["", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-10-26" → { weekday: "lun", day: "26", month: "oct" } (sin depender del locale del servidor). */
export function dateParts(date: DateKey) {
  const [, m, d] = date.split("-").map(Number);
  return { weekday: WEEKDAY_SHORT[isoWeekday(date)], day: String(d), month: MONTH_SHORT[m] };
}

/** "lunes 26 de oct" — y "hoy"/"mañana" relativo a `today`. */
export function formatServiceDate(date: DateKey, today?: DateKey): string {
  const [, m, d] = date.split("-").map(Number);
  const base = `${WEEKDAY_LONG[isoWeekday(date)]} ${d} de ${MONTH_SHORT[m]}`;
  if (!today) return base;
  const delta = diffDays(today, date);
  if (delta === 0) return `hoy, ${base}`;
  if (delta === 1) return `mañana, ${base}`;
  return base;
}

/** Instante → "lun 26 de oct, 20:00" en Asunción. */
export function formatInstant(at: Date): string {
  const key = todayKey(at);
  const z = new Intl.DateTimeFormat("es-PY", {
    timeZone: "America/Asuncion",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
  const { weekday, day, month } = dateParts(key);
  return `${weekday} ${day} de ${month}, ${z}`;
}
