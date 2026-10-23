"use server";

import { db } from "@/lib/db";
import { requireRestaurantBySlug } from "@/modules/auth/session";
import { revalidateRestaurant } from "@/modules/restaurants/access";
import { fieldErrorsFrom, invalid, type ActionState } from "@/modules/restaurants/form";
import { WEEKDAYS } from "@/modules/restaurants/rules";
import { dateKeyToDb, dbDateToKey, isDateKey, todayKey, type DateKey } from "@/modules/shared/time";
import { ensureDayMaterialized } from "./materialize";
import { addDishToDaySchema, closureSchema, dayStockSchema, dishScheduleSchema, optionDayStockSchema } from "./schemas";
import { dishUsageOnDate, holdingOrdersOnDate, optionUsageOnDate, propagateDishSchedule } from "./stock-sync";
import { diffSchedule, stockBelowUsedError } from "./stock-rules";

// Disponibilidad desde el panel: plantilla semanal por plato, stock por fecha
// (platos y opciones) y feriados. Los cambios de stock de un día se hacen con
// la fila bloqueada (FOR UPDATE) para no competir con una reserva en curso.

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

const PAST_DAY = "Ese día ya pasó: no se puede editar.";

export async function saveDishScheduleAction(slug: string, dishId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { restaurant } = await requireRestaurantBySlug(slug);
  const parsed = dishScheduleSchema.safeParse({ stocks: WEEKDAYS.map((d) => str(formData, `stock:${d}`)) });
  if (!parsed.success) {
    const mapped: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const i = Number(issue.path[1]);
      (mapped[Number.isInteger(i) ? `stock:${i + 1}` : "form"] ??= []).push(issue.message);
    }
    return invalid(formData, mapped);
  }
  const dish = await db.dish.findFirst({
    where: { id: dishId, restaurantId: restaurant.id, deletedAt: null },
    select: { id: true, schedules: { select: { weekday: true, defaultStock: true } } },
  });
  if (!dish) return { error: "El plato no existe." };

  const next = parsed.data.stocks.flatMap((stock, i) => (stock === null ? [] : [{ weekday: i + 1, defaultStock: stock }]));
  const diff = diffSchedule(dish.schedules, next);
  const result = await db.$transaction(async (tx) => {
    if (diff.removed.length) {
      await tx.dishSchedule.deleteMany({ where: { dishId, weekday: { in: diff.removed.map((r) => r.weekday) } } });
    }
    for (const e of [...diff.added, ...diff.changed.map((c) => ({ weekday: c.weekday, defaultStock: c.to }))]) {
      await tx.dishSchedule.upsert({
        where: { dishId_weekday: { dishId, weekday: e.weekday } },
        create: { dishId, weekday: e.weekday, defaultStock: e.defaultStock },
        update: { defaultStock: e.defaultStock },
      });
    }
    return propagateDishSchedule(tx, { dishId, diff, today: todayKey() });
  });

  revalidateRestaurant(restaurant);
  const touched = result.updated + result.removed;
  return {
    ok: true,
    message: touched ? `Plantilla guardada. Se actualizaron ${touched} día(s) ya cargado(s).` : "Plantilla guardada.",
  };
}

export async function updateDayStockAction(slug: string, stockId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { restaurant } = await requireRestaurantBySlug(slug);
  const parsed = dayStockSchema.safeParse({ stock: str(formData, "stock"), isClosed: str(formData, "isClosed") });
  if (!parsed.success) return invalid(formData, fieldErrorsFrom(parsed.error));

  const result = await db.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ id: string; dishId: string; date: Date }[]>`
      SELECT "id", "dishId", "date" FROM "DailyDishStock"
      WHERE "id" = ${stockId} AND "restaurantId" = ${restaurant.id} FOR UPDATE`;
    if (!row) return { error: "Esa fila no existe." } as const;
    const date = dbDateToKey(row.date);
    if (date < todayKey()) return { error: PAST_DAY } as const;
    const used = (await dishUsageOnDate(tx, restaurant.id, date)).get(row.dishId)?.held ?? 0;
    const error = stockBelowUsedError(parsed.data.stock, used);
    if (error) return { fieldError: error } as const;
    await tx.dailyDishStock.update({ where: { id: row.id }, data: parsed.data });
    return { ok: true } as const;
  });
  if ("error" in result) return { error: result.error };
  if ("fieldError" in result) return invalid(formData, { stock: [result.fieldError!] }, result.fieldError);
  revalidateRestaurant(restaurant);
  return { ok: true, message: "Guardado." };
}

/** Agrega a mano un plato a un día puntual (menú rotativo fuera de la plantilla). */
export async function addDishToDayAction(slug: string, date: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { restaurant } = await requireRestaurantBySlug(slug);
  if (!isDateKey(date) || date < todayKey()) return { error: PAST_DAY };
  const parsed = addDishToDaySchema.safeParse({ dishId: str(formData, "dishId"), stock: str(formData, "stock") });
  if (!parsed.success) return invalid(formData, fieldErrorsFrom(parsed.error));
  const dish = await db.dish.findFirst({ where: { id: parsed.data.dishId, restaurantId: restaurant.id, deletedAt: null }, select: { id: true } });
  if (!dish) return invalid(formData, { dishId: ["Plato inválido"] });
  const closure = await db.restaurantClosure.findUnique({ where: { restaurantId_date: { restaurantId: restaurant.id, date: dateKeyToDb(date) } } });
  if (closure) return { error: "Ese día está marcado como feriado." };

  const created = await db.$transaction(async (tx) => {
    await ensureDayMaterialized(tx, restaurant.id, date);
    const rows = await tx.dailyDishStock.createMany({
      data: [{ restaurantId: restaurant.id, dishId: dish.id, date: dateKeyToDb(date), stock: parsed.data.stock }],
      skipDuplicates: true,
    });
    return rows.count;
  });
  if (created === 0) return invalid(formData, { dishId: ["Ese plato ya está en el día."] });
  revalidateRestaurant(restaurant);
  return { ok: true, message: "Plato agregado al día." };
}

export async function updateOptionDayStockAction(slug: string, rowId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { restaurant } = await requireRestaurantBySlug(slug);
  const parsed = optionDayStockSchema.safeParse({ stock: str(formData, "stock") });
  if (!parsed.success) return invalid(formData, fieldErrorsFrom(parsed.error));

  const result = await db.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ id: string; optionId: string; date: Date }[]>`
      SELECT s."id", s."optionId", s."date" FROM "OptionDailyStock" s
      JOIN "ModifierOption" o ON o."id" = s."optionId"
      JOIN "ModifierGroup" g ON g."id" = o."groupId"
      WHERE s."id" = ${rowId} AND g."restaurantId" = ${restaurant.id}
      FOR UPDATE OF s`;
    if (!row) return { error: "Esa fila no existe." } as const;
    const date = dbDateToKey(row.date);
    if (date < todayKey()) return { error: PAST_DAY } as const;
    const used = (await optionUsageOnDate(tx, restaurant.id, date)).get(row.optionId)?.held ?? 0;
    const error = stockBelowUsedError(parsed.data.stock, used);
    if (error) return { fieldError: error } as const;
    await tx.optionDailyStock.update({ where: { id: row.id }, data: { stock: parsed.data.stock } });
    return { ok: true } as const;
  });
  if ("error" in result) return { error: result.error };
  if ("fieldError" in result) return invalid(formData, { stock: [result.fieldError!] }, result.fieldError);
  revalidateRestaurant(restaurant);
  return { ok: true, message: "Guardado." };
}

/**
 * Feriado / día cerrado. No se permite si hay pedidos que retienen cupo ese día
 * (primero hay que cancelarlos desde Pedidos, con reembolso). Se limpian las
 * filas ya materializadas para que el día no se ofrezca.
 */
export async function addClosureAction(slug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { restaurant } = await requireRestaurantBySlug(slug);
  const parsed = closureSchema.safeParse({ date: str(formData, "date"), reason: str(formData, "reason") });
  if (!parsed.success) return invalid(formData, fieldErrorsFrom(parsed.error));
  const date: DateKey = parsed.data.date;
  if (date < todayKey()) return invalid(formData, { date: ["Elegí hoy o una fecha futura."] });

  const result = await db.$transaction(async (tx) => {
    const day = dateKeyToDb(date);
    // Bloquea las franjas del día: una reserva concurrente espera y después ve el feriado.
    await tx.$queryRaw`SELECT "id" FROM "DailySlot" WHERE "restaurantId" = ${restaurant.id} AND "date" = ${day}::date ORDER BY "id" FOR UPDATE`;
    const holding = await holdingOrdersOnDate(tx, restaurant.id, date);
    if (holding > 0) return { holding };
    const created = await tx.restaurantClosure.createMany({
      data: [{ restaurantId: restaurant.id, date: day, reason: parsed.data.reason }],
      skipDuplicates: true,
    });
    if (created.count === 0) return { duplicate: true };
    await tx.dailyDishStock.deleteMany({ where: { restaurantId: restaurant.id, date: day } });
    await tx.optionDailyStock.deleteMany({ where: { date: day, option: { group: { restaurantId: restaurant.id } } } });
    // Las franjas con pedidos (vencidos/cancelados) no se pueden borrar: se cierran.
    await tx.dailySlot.deleteMany({ where: { restaurantId: restaurant.id, date: day, orders: { none: {} } } });
    await tx.dailySlot.updateMany({ where: { restaurantId: restaurant.id, date: day }, data: { isClosed: true } });
    return { ok: true };
  });
  if ("holding" in result) {
    return invalid(formData, {
      date: [`Hay ${result.holding} pedido(s) para ese día. Cancelalos desde Pedidos antes de marcarlo como feriado.`],
    });
  }
  if ("duplicate" in result) return invalid(formData, { date: ["Ese día ya está marcado como feriado."] });
  revalidateRestaurant(restaurant);
  return { ok: true, message: "Feriado agregado." };
}

/** Quita el feriado: el día se vuelve a armar desde las plantillas al consultarlo. */
export async function removeClosureAction(slug: string, closureId: string): Promise<ActionState> {
  const { restaurant } = await requireRestaurantBySlug(slug);
  const { count } = await db.restaurantClosure.deleteMany({ where: { id: closureId, restaurantId: restaurant.id } });
  if (count === 0) return { error: "Ese feriado no existe." };
  revalidateRestaurant(restaurant);
  return { ok: true, message: "Feriado quitado." };
}
