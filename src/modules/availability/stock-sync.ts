import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/lib/db-types";
import { HOLDING_CONDITION_SQL, PAID_ACTIVE_STATUSES } from "@/modules/orders/statuses";
import { dateKeyToDb, dbDateToKey, isoWeekday, type DateKey } from "@/modules/shared/time";
import { shouldPropagateDefault, type ScheduleDiff } from "./stock-rules";

// Ocupación de stock/cupo contada SIEMPRE desde los pedidos que retienen
// (HOLDING_CONDITION_SQL: pagos o reservas vigentes), y propagación de
// cambios de valores por defecto a los días futuros ya materializados.

const HOLDING = Prisma.raw(HOLDING_CONDITION_SQL);
const PAID = Prisma.raw(`"status" IN (${PAID_ACTIVE_STATUSES.map((s) => `'${s}'`).join(",")})`);

export type Usage = { held: number; sold: number; reserved: number };
const usage = (held: number, sold: number): Usage => ({ held, sold, reserved: held - sold });

/** Unidades de cada plato vendidas/reservadas en una fecha. */
export async function dishUsageOnDate(tx: Tx, restaurantId: string, date: DateKey): Promise<Map<string, Usage>> {
  const rows = await tx.$queryRaw<{ key: string; held: number; sold: number }[]>`
    SELECT i."dishId" AS key, SUM(i."quantity")::int AS held,
           COALESCE(SUM(i."quantity") FILTER (WHERE ${PAID}), 0)::int AS sold
    FROM "Order" o JOIN "OrderItem" i ON i."orderId" = o."id"
    WHERE o."restaurantId" = ${restaurantId} AND o."serviceDate" = ${dateKeyToDb(date)}::date AND ${HOLDING}
    GROUP BY i."dishId"`;
  return new Map(rows.map((r) => [r.key, usage(r.held, r.sold)]));
}

/** Unidades de cada opción (con stock propio) vendidas/reservadas en una fecha. */
export async function optionUsageOnDate(tx: Tx, restaurantId: string, date: DateKey): Promise<Map<string, Usage>> {
  const rows = await tx.$queryRaw<{ key: string; held: number; sold: number }[]>`
    SELECT m."optionId" AS key, SUM(i."quantity")::int AS held,
           COALESCE(SUM(i."quantity") FILTER (WHERE ${PAID}), 0)::int AS sold
    FROM "Order" o
    JOIN "OrderItem" i ON i."orderId" = o."id"
    JOIN "OrderItemModifier" m ON m."orderItemId" = i."id"
    WHERE o."restaurantId" = ${restaurantId} AND o."serviceDate" = ${dateKeyToDb(date)}::date AND ${HOLDING}
    GROUP BY m."optionId"`;
  return new Map(rows.map((r) => [r.key, usage(r.held, r.sold)]));
}

/** Pedidos por franja: los que retienen cupo y el total (cualquier estado). */
export async function slotOccupancy(tx: Tx, slotIds: string[]): Promise<Map<string, Usage & { total: number }>> {
  if (slotIds.length === 0) return new Map();
  const rows = await tx.$queryRaw<{ key: string; held: number; sold: number; total: number }[]>`
    SELECT o."slotId" AS key,
           COUNT(*) FILTER (WHERE ${HOLDING})::int AS held,
           COUNT(*) FILTER (WHERE ${PAID})::int AS sold,
           COUNT(*)::int AS total
    FROM "Order" o
    WHERE o."slotId" IN (${Prisma.join(slotIds)})
    GROUP BY o."slotId"`;
  return new Map(rows.map((r) => [r.key, { ...usage(r.held, r.sold), total: r.total }]));
}

/** Pedidos que retienen cupo en una fecha (para no cerrar un día con pedidos). */
export async function holdingOrdersOnDate(tx: Tx, restaurantId: string, date: DateKey): Promise<number> {
  const [row] = await tx.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM "Order"
    WHERE "restaurantId" = ${restaurantId} AND "serviceDate" = ${dateKeyToDb(date)}::date AND ${HOLDING}`;
  return row?.n ?? 0;
}

/** Unidades retenidas de un plato por fecha, para fechas posteriores a `after`. */
async function dishHeldByDate(tx: Tx, dishId: string, after: DateKey): Promise<Map<DateKey, number>> {
  const rows = await tx.$queryRaw<{ date: Date; held: number }[]>`
    SELECT o."serviceDate" AS date, SUM(i."quantity")::int AS held
    FROM "Order" o JOIN "OrderItem" i ON i."orderId" = o."id"
    WHERE i."dishId" = ${dishId} AND o."serviceDate" > ${dateKeyToDb(after)}::date AND ${HOLDING}
    GROUP BY o."serviceDate"`;
  return new Map(rows.map((r) => [dbDateToKey(r.date), r.held]));
}

async function optionHeldByDate(tx: Tx, optionId: string, after: DateKey): Promise<Map<DateKey, number>> {
  const rows = await tx.$queryRaw<{ date: Date; held: number }[]>`
    SELECT o."serviceDate" AS date, SUM(i."quantity")::int AS held
    FROM "Order" o
    JOIN "OrderItem" i ON i."orderId" = o."id"
    JOIN "OrderItemModifier" m ON m."orderItemId" = i."id"
    WHERE m."optionId" = ${optionId} AND o."serviceDate" > ${dateKeyToDb(after)}::date AND ${HOLDING}
    GROUP BY o."serviceDate"`;
  return new Map(rows.map((r) => [dbDateToKey(r.date), r.held]));
}

/**
 * Cambió la plantilla semanal de un plato. En los días futuros ya materializados:
 *  - stock por defecto cambiado → se actualiza la fila si todavía tiene el valor
 *    anterior y no hay pedidos que retengan stock;
 *  - día quitado de la plantilla → se borra la fila con las mismas condiciones
 *    (y si no está cerrada a mano): era solo producto de la plantilla.
 *  - día agregado → no hace falta nada: ensureDayMaterialized la crea al consultar.
 * Las filas se bloquean (FOR UPDATE, por id) para no competir con una reserva.
 */
export async function propagateDishSchedule(tx: Tx, p: { dishId: string; diff: ScheduleDiff; today: DateKey }) {
  if (p.diff.changed.length === 0 && p.diff.removed.length === 0) return { updated: 0, removed: 0 };
  const rows = await tx.$queryRaw<{ id: string; date: Date; stock: number; isClosed: boolean }[]>`
    SELECT "id", "date", "stock", "isClosed" FROM "DailyDishStock"
    WHERE "dishId" = ${p.dishId} AND "date" > ${dateKeyToDb(p.today)}::date
    ORDER BY "id" FOR UPDATE`;
  if (rows.length === 0) return { updated: 0, removed: 0 };
  const held = await dishHeldByDate(tx, p.dishId, p.today);
  const changed = new Map(p.diff.changed.map((c) => [c.weekday, c]));
  const removed = new Map(p.diff.removed.map((r) => [r.weekday, r.defaultStock]));

  const updates = new Map<number, string[]>(); // nuevo stock → ids
  const deletes: string[] = [];
  for (const row of rows) {
    const date = dbDateToKey(row.date);
    const weekday = isoWeekday(date);
    const base = { date, today: p.today, currentValue: row.stock, holdingQty: held.get(date) ?? 0 };
    const change = changed.get(weekday);
    if (change && shouldPropagateDefault({ ...base, previousDefault: change.from })) {
      updates.set(change.to, [...(updates.get(change.to) ?? []), row.id]);
    }
    const removedStock = removed.get(weekday);
    if (removedStock !== undefined && !row.isClosed && shouldPropagateDefault({ ...base, previousDefault: removedStock })) {
      deletes.push(row.id);
    }
  }
  let updated = 0;
  for (const [stock, ids] of updates) {
    updated += (await tx.dailyDishStock.updateMany({ where: { id: { in: ids } }, data: { stock } })).count;
  }
  const removedCount = deletes.length ? (await tx.dailyDishStock.deleteMany({ where: { id: { in: deletes } } })).count : 0;
  return { updated, removed: removedCount };
}

/**
 * Cambió el `dailyStock` de una opción. En los días futuros ya materializados,
 * sin pedidos que la retengan y con el valor anterior: se actualiza (o se borra
 * la fila si ahora es sin límite). Si antes era sin límite no hay filas: se
 * crean solas al materializar.
 */
export async function propagateOptionDailyStock(
  tx: Tx,
  p: { optionId: string; from: number | null; to: number | null; today: DateKey },
) {
  if (p.from === null || p.from === p.to) return { updated: 0, removed: 0 };
  const rows = await tx.$queryRaw<{ id: string; date: Date; stock: number }[]>`
    SELECT "id", "date", "stock" FROM "OptionDailyStock"
    WHERE "optionId" = ${p.optionId} AND "date" > ${dateKeyToDb(p.today)}::date
    ORDER BY "id" FOR UPDATE`;
  if (rows.length === 0) return { updated: 0, removed: 0 };
  const held = await optionHeldByDate(tx, p.optionId, p.today);
  const ids = rows
    .filter((r) => {
      const date = dbDateToKey(r.date);
      return shouldPropagateDefault({ date, today: p.today, currentValue: r.stock, previousDefault: p.from!, holdingQty: held.get(date) ?? 0 });
    })
    .map((r) => r.id);
  if (ids.length === 0) return { updated: 0, removed: 0 };
  if (p.to === null) {
    return { updated: 0, removed: (await tx.optionDailyStock.deleteMany({ where: { id: { in: ids } } })).count };
  }
  return { updated: (await tx.optionDailyStock.updateMany({ where: { id: { in: ids } }, data: { stock: p.to } })).count, removed: 0 };
}

/**
 * Cambió una plantilla de franja. En sus franjas futuras ya materializadas:
 *  - cupo cambiado → se actualiza si todavía tiene el cupo anterior y no hay pedidos que lo retengan;
 *  - horario/alcance cambiado, o plantilla desactivada/borrada → se borran las franjas
 *    SIN ningún pedido (se vuelven a materializar con los datos nuevos). Las que tienen
 *    pedidos quedan como estaban y se gestionan a mano en la vista por día.
 */
export async function propagateSlotTemplate(
  tx: Tx,
  p: { templateId: string; today: DateKey; previousCapacity: number; capacity: number; structural: boolean },
) {
  const slots = await tx.$queryRaw<{ id: string; date: Date; capacity: number }[]>`
    SELECT "id", "date", "capacity" FROM "DailySlot"
    WHERE "templateId" = ${p.templateId} AND "date" > ${dateKeyToDb(p.today)}::date
    ORDER BY "id" FOR UPDATE`;
  if (slots.length === 0) return { updated: 0, removed: 0 };
  const occupancy = await slotOccupancy(
    tx,
    slots.map((s) => s.id),
  );
  if (p.structural) {
    const ids = slots.filter((s) => (occupancy.get(s.id)?.total ?? 0) === 0).map((s) => s.id);
    const removed = ids.length ? (await tx.dailySlot.deleteMany({ where: { id: { in: ids } } })).count : 0;
    return { updated: 0, removed };
  }
  if (p.previousCapacity === p.capacity) return { updated: 0, removed: 0 };
  const ids = slots
    .filter((s) =>
      shouldPropagateDefault({
        date: dbDateToKey(s.date),
        today: p.today,
        currentValue: s.capacity,
        previousDefault: p.previousCapacity,
        holdingQty: occupancy.get(s.id)?.held ?? 0,
      }),
    )
    .map((s) => s.id);
  const updated = ids.length ? (await tx.dailySlot.updateMany({ where: { id: { in: ids } }, data: { capacity: p.capacity } })).count : 0;
  return { updated, removed: 0 };
}
