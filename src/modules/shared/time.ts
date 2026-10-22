import { TZDate } from "@date-fns/tz";

// Toda la lógica de calendario vive en America/Asuncion.
// - Un "día de servicio" se representa como string "YYYY-MM-DD" (DateKey).
// - En la base es @db.Date; Prisma lo devuelve como Date a las 00:00 UTC.
// - Las horas del día son minutos desde 00:00 (720 = 12:00).

export const TIME_ZONE = "America/Asuncion";

export type DateKey = string; // "2026-11-03"

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(s: string): s is DateKey {
  return DATE_KEY_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

/** DateKey → Date para columnas @db.Date. */
export function dateKeyToDb(key: DateKey): Date {
  if (!isDateKey(key)) throw new Error(`Fecha inválida: ${key}`);
  return new Date(`${key}T00:00:00.000Z`);
}

/** Date de una columna @db.Date → DateKey. */
export function dbDateToKey(d: Date): DateKey {
  return d.toISOString().slice(0, 10);
}

/** Día de hoy en Asunción para un instante dado. */
export function todayKey(now: Date = new Date()): DateKey {
  const z = new TZDate(now.getTime(), TIME_ZONE);
  return formatKey(z.getFullYear(), z.getMonth() + 1, z.getDate());
}

/** Minutos desde 00:00 en Asunción para un instante. */
export function minuteOfDay(now: Date = new Date()): number {
  const z = new TZDate(now.getTime(), TIME_ZONE);
  return z.getHours() * 60 + z.getMinutes();
}

export function addDays(key: DateKey, days: number): DateKey {
  const d = dateKeyToDb(key);
  d.setUTCDate(d.getUTCDate() + days);
  return dbDateToKey(d);
}

/** Diferencia en días calendario (b - a). */
export function diffDays(a: DateKey, b: DateKey): number {
  return Math.round((dateKeyToDb(b).getTime() - dateKeyToDb(a).getTime()) / 86_400_000);
}

/** ISO: 1 = lunes … 7 = domingo. */
export function isoWeekday(key: DateKey): number {
  const day = dateKeyToDb(key).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Instante real que corresponde a (día, minuto) en Asunción. */
export function zonedInstant(key: DateKey, minute: number): Date {
  const [y, m, d] = key.split("-").map(Number);
  const z = new TZDate(y, m - 1, d, Math.floor(minute / 60), minute % 60, 0, TIME_ZONE);
  return new Date(z.getTime());
}

/**
 * Hora de corte del día de servicio D: (D - cutoffDaysBefore) a las cutoffMinute.
 * Ej.: D = martes, (1, 1200) → lunes 20:00.
 */
export function cutoffInstant(serviceDate: DateKey, cutoffDaysBefore: number, cutoffMinute: number): Date {
  return zonedInstant(addDays(serviceDate, -cutoffDaysBefore), cutoffMinute);
}

/** Primer y último día del mes de `key`. */
export function monthBounds(key: DateKey): { start: DateKey; end: DateKey } {
  const [y, m] = key.split("-").map(Number);
  const start = formatKey(y, m, 1);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start, end: formatKey(y, m, last) };
}

/** Primer día del mes siguiente. */
export function nextMonthStart(key: DateKey): DateKey {
  const [y, m] = key.split("-").map(Number);
  return m === 12 ? formatKey(y + 1, 1, 1) : formatKey(y, m + 1, 1);
}

/** Lista de días [from, to] inclusive. */
export function eachDay(from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

/** 750 → "12:30" */
export function formatMinute(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "12:30" → 750 */
export function parseMinute(hhmm: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) throw new Error(`Hora inválida: ${hhmm}`);
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 24 || m > 59 || (h === 24 && m > 0)) throw new Error(`Hora inválida: ${hhmm}`);
  return h * 60 + m;
}

function formatKey(y: number, m: number, d: number): DateKey {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
