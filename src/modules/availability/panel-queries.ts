import "server-only";
import { db } from "@/lib/db";
import { addDays, dateKeyToDb, dbDateToKey, eachDay, type DateKey } from "@/modules/shared/time";
import { ensureDayMaterialized } from "./materialize";
import { dishUsageOnDate, optionUsageOnDate, slotOccupancy } from "./stock-sync";

// Lecturas de disponibilidad y franjas para el panel. Antes de mostrar un día
// se materializa (idempotente), así el restaurante ve y edita las filas reales.

/** Próximos `days` días desde hoy, marcando feriados. */
export async function getDateStrip(restaurantId: string, today: DateKey, days = 14) {
  const last = addDays(today, days - 1);
  const closures = await db.restaurantClosure.findMany({
    where: { restaurantId, date: { gte: dateKeyToDb(today), lte: dateKeyToDb(last) } },
    select: { date: true },
  });
  const closed = new Set(closures.map((c) => dbDateToKey(c.date)));
  return eachDay(today, last).map((date) => ({ date, closed: closed.has(date) }));
}

export async function getDayAvailability(restaurantId: string, date: DateKey) {
  await db.$transaction((tx) => ensureDayMaterialized(tx, restaurantId, date));
  const day = dateKeyToDb(date);
  const [closure, rows, dishUsage, optionRows, optionUsage, dishes] = await Promise.all([
    db.restaurantClosure.findUnique({ where: { restaurantId_date: { restaurantId, date: day } } }),
    db.dailyDishStock.findMany({
      where: { restaurantId, date: day },
      include: { dish: { select: { name: true, isActive: true, deletedAt: true, photoUrl: true } } },
      orderBy: { dish: { name: "asc" } },
    }),
    dishUsageOnDate(db, restaurantId, date),
    db.optionDailyStock.findMany({
      where: { date: day, option: { group: { restaurantId } } },
      include: { option: { select: { name: true, deletedAt: true, isActive: true, group: { select: { name: true, deletedAt: true } } } } },
      orderBy: { option: { name: "asc" } },
    }),
    optionUsageOnDate(db, restaurantId, date),
    db.dish.findMany({ where: { restaurantId, deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, isActive: true } }),
  ]);
  const zero = { held: 0, sold: 0, reserved: 0 };
  const inDay = new Set(rows.map((r) => r.dishId));
  return {
    closure,
    dishes: rows
      .filter((r) => !r.dish.deletedAt || (dishUsage.get(r.dishId)?.held ?? 0) > 0)
      .map((r) => ({ ...r, usage: dishUsage.get(r.dishId) ?? zero })),
    options: optionRows
      .filter((r) => !r.option.deletedAt && !r.option.group.deletedAt)
      .map((r) => ({ ...r, usage: optionUsage.get(r.optionId) ?? zero })),
    addable: dishes.filter((d) => !inDay.has(d.id)),
  };
}

/** Plantilla semanal de todos los platos vigentes. */
export async function getWeeklyTemplate(restaurantId: string) {
  return db.dish.findMany({
    where: { restaurantId, deletedAt: null },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: { id: true, name: true, isActive: true, schedules: { select: { weekday: true, defaultStock: true } } },
  });
}

export async function getUpcomingClosures(restaurantId: string, today: DateKey) {
  return db.restaurantClosure.findMany({ where: { restaurantId, date: { gte: dateKeyToDb(today) } }, orderBy: { date: "asc" } });
}

export async function getSlotTemplates(restaurantId: string) {
  return db.timeSlotTemplate.findMany({
    where: { restaurantId },
    orderBy: [{ weekday: "asc" }, { startMinute: "asc" }, { scope: "asc" }],
  });
}

export async function getDaySlots(restaurantId: string, date: DateKey) {
  await db.$transaction((tx) => ensureDayMaterialized(tx, restaurantId, date));
  const day = dateKeyToDb(date);
  const [closure, slots] = await Promise.all([
    db.restaurantClosure.findUnique({ where: { restaurantId_date: { restaurantId, date: day } } }),
    db.dailySlot.findMany({ where: { restaurantId, date: day }, orderBy: [{ startMinute: "asc" }, { scope: "asc" }] }),
  ]);
  const occupancy = await slotOccupancy(
    db,
    slots.map((s) => s.id),
  );
  return {
    closure,
    slots: slots.map((s) => ({ ...s, occupancy: occupancy.get(s.id) ?? { held: 0, sold: 0, reserved: 0, total: 0 } })),
  };
}
