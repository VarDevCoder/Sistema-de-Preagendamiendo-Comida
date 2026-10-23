import { addDays, formatMinute, isoWeekday, minuteOfDay, todayKey, type DateKey } from "@/modules/shared/time";

// Fechas en texto para mensajes. No se usa Intl/toLocaleDateString para que el
// resultado no dependa del runtime (ICU) ni de la zona horaria del servidor.

const WEEKDAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** "2026-11-03" → "martes 3 de noviembre" */
export function formatServiceDate(key: DateKey): string {
  const [, m, d] = key.split("-").map(Number);
  return `${WEEKDAYS[isoWeekday(key) - 1]} ${d} de ${MONTHS[m - 1]}`;
}

/** "2026-11-03" → "3/11" */
export function formatShortDate(key: DateKey): string {
  const [, m, d] = key.split("-").map(Number);
  return `${d}/${m}`;
}

/** Fecha corta para la bandeja, en hora de Asunción: "hoy 18:05", "ayer 09:30", "3/11 12:00". */
export function formatInboxDate(at: Date, now: Date = new Date()): string {
  const day = todayKey(at);
  const today = todayKey(now);
  const time = formatMinute(minuteOfDay(at));
  if (day === today) return `hoy ${time}`;
  if (day === addDays(today, -1)) return `ayer ${time}`;
  return `${formatShortDate(day)} ${time}`;
}
