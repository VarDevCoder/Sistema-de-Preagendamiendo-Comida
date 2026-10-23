import type { Allergen, Fulfillment } from "@/generated/prisma/enums";
import { ALLERGEN_LABEL } from "@/modules/shared/labels";
import { isoWeekday, type DateKey } from "@/modules/shared/time";

// Formatos de presentación compartidos por producción, pedidos del día y PDF.
// Se calculan desde el DateKey (sin toLocaleDateString) para no depender de la zona del servidor.

const WEEKDAYS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const WEEKDAYS_SHORT = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
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

/** "2026-10-23" → "viernes 23 de octubre de 2026" */
export function formatDateLong(key: DateKey): string {
  const [y, m, d] = key.split("-").map(Number);
  return `${WEEKDAYS[isoWeekday(key) - 1]} ${d} de ${MONTHS[m - 1]} de ${y}`;
}

/** "2026-10-23" → "vie 23/10" */
export function formatDateShort(key: DateKey): string {
  const [, m, d] = key.split("-").map(Number);
  return `${WEEKDAYS_SHORT[isoWeekday(key) - 1]} ${d}/${m}`;
}

/** Texto de alergias del pedido: "Gluten, Maní, frutillas". Vacío si no hay. */
export function allergyText(allergens: Allergen[], other: string | null): string {
  const parts = allergens.filter((a) => a !== "OTHER").map((a) => ALLERGEN_LABEL[a]);
  const extra = other?.trim();
  if (extra) parts.push(extra);
  else if (allergens.includes("OTHER")) parts.push(ALLERGEN_LABEL.OTHER);
  return parts.join(", ");
}

export const FULFILLMENT_LABEL: Record<Fulfillment, string> = { PICKUP: "Retiro", DELIVERY: "Delivery" };

/** Hora local (Asunción) de un instante, "20:00". */
export function formatInstantTime(d: Date): string {
  return new Intl.DateTimeFormat("es-PY", {
    timeZone: "America/Asuncion",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

/** Fecha y hora local (Asunción), "22/10/2026 20:00". */
export function formatInstant(d: Date): string {
  return new Intl.DateTimeFormat("es-PY", {
    timeZone: "America/Asuncion",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}
