import { addDays, todayKey, type DateKey } from "@/modules/shared/time";

/**
 * Día de servicio cuyos pedidos se recuerdan en una corrida del cron: MAÑANA
 * en America/Asuncion (no en UTC). El cron corre 21:00 UTC = 18:00 en Asunción,
 * pero el cálculo vale para cualquier hora en que se lo dispare a mano.
 */
export function reminderServiceDate(now: Date = new Date()): DateKey {
  return addDays(todayKey(now), 1);
}
