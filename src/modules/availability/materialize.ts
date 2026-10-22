import type { Tx } from "@/lib/db-types";
import { dateKeyToDb, isoWeekday, type DateKey } from "@/modules/shared/time";

/**
 * Crea (si faltan) las filas por fecha de un restaurante a partir de sus
 * plantillas semanales:
 *   TimeSlotTemplate → DailySlot
 *   DishSchedule     → DailyDishStock   (solo platos activos y no borrados)
 *   ModifierOption.dailyStock → OptionDailyStock
 *
 * Es idempotente (INSERT … ON CONFLICT DO NOTHING) y NUNCA pisa filas
 * existentes: lo que el restaurante editó para un día puntual se respeta.
 * Para sacar algo de un día se usa isClosed = true, no se borra la fila.
 * Si el día está en RestaurantClosure (feriado), no crea nada.
 *
 * Llamarlo justo antes de leer disponibilidad o de bloquear filas (FOR UPDATE).
 */
export async function ensureDayMaterialized(tx: Tx, restaurantId: string, date: DateKey): Promise<void> {
  const day = dateKeyToDb(date);
  const weekday = isoWeekday(date);

  const closed = await tx.restaurantClosure.findUnique({
    where: { restaurantId_date: { restaurantId, date: day } },
    select: { id: true },
  });
  if (closed) return;

  await tx.$executeRaw`
    INSERT INTO "DailySlot" ("id", "restaurantId", "templateId", "date", "startMinute", "endMinute", "capacity", "scope", "isClosed", "createdAt")
    SELECT gen_random_uuid()::text, t."restaurantId", t."id", ${day}::date, t."startMinute", t."endMinute", t."capacity", t."scope", false, now()
    FROM "TimeSlotTemplate" t
    WHERE t."restaurantId" = ${restaurantId} AND t."weekday" = ${weekday} AND t."isActive"
    ON CONFLICT ("restaurantId", "date", "startMinute", "scope") DO NOTHING`;

  await tx.$executeRaw`
    INSERT INTO "DailyDishStock" ("id", "restaurantId", "dishId", "date", "stock", "isClosed", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, d."restaurantId", d."id", ${day}::date, s."defaultStock", false, now(), now()
    FROM "DishSchedule" s JOIN "Dish" d ON d."id" = s."dishId"
    WHERE d."restaurantId" = ${restaurantId} AND s."weekday" = ${weekday} AND d."isActive" AND d."deletedAt" IS NULL
    ON CONFLICT ("dishId", "date") DO NOTHING`;

  await tx.$executeRaw`
    INSERT INTO "OptionDailyStock" ("id", "optionId", "date", "stock")
    SELECT gen_random_uuid()::text, o."id", ${day}::date, o."dailyStock"
    FROM "ModifierOption" o JOIN "ModifierGroup" g ON g."id" = o."groupId"
    WHERE g."restaurantId" = ${restaurantId} AND o."dailyStock" IS NOT NULL AND o."deletedAt" IS NULL AND g."deletedAt" IS NULL
      AND EXISTS (SELECT 1 FROM "DailySlot" ds WHERE ds."restaurantId" = ${restaurantId} AND ds."date" = ${day}::date)
    ON CONFLICT ("optionId", "date") DO NOTHING`;
}

/** Igual que ensureDayMaterialized para un rango de días. */
export async function ensureDaysMaterialized(tx: Tx, restaurantId: string, dates: DateKey[]): Promise<void> {
  for (const date of dates) await ensureDayMaterialized(tx, restaurantId, date);
}
