import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { addDays, dateKeyToDb, dbDateToKey, eachDay, todayKey, zonedInstant, type DateKey } from "@/modules/shared/time";
import { dailySeries, forecastMatrix, rateBps, topModifiersByDish, topN, type PeriodDays } from "./calc";

// Métricas del dashboard del restaurante (RF-R12). Quien llama ya autorizó el acceso.
//
// Definiciones:
// - "Pagos" = pedidos que llegaron a CONFIRMED (activos, entregados o cancelados después).
// - El período (7/30 días) se mide por la fecha de pago (confirmedAt): es cuándo
//   entró la plata, que es lo que importa en un modelo prepago.
// - "Cobrado por adelantado" = pedidos pagos todavía no entregados con día de servicio hoy o futuro.

const ACTIVE = Prisma.sql`('CONFIRMED','IN_PREPARATION','READY','DELIVERED')`;

export async function getRestaurantDashboard(restaurantId: string, period: PeriodDays, now: Date = new Date()) {
  const today = todayKey(now);
  const periodStart = zonedInstant(addDays(today, -(period - 1)), 0);
  const nextDays = eachDay(today, addDays(today, 6));
  const horizonEnd = nextDays[nextDays.length - 1];

  const [upcoming, advance, periodAgg, subscribers, dishUnits, modifierPicks, forecastRows] = await Promise.all([
    db.order.groupBy({
      by: ["serviceDate"],
      where: {
        restaurantId,
        serviceDate: { gte: dateKeyToDb(today), lte: dateKeyToDb(horizonEnd) },
        status: { in: ["CONFIRMED", "IN_PREPARATION", "READY", "DELIVERED"] },
      },
      _count: { _all: true },
    }),
    db.order.aggregate({
      where: { restaurantId, serviceDate: { gte: dateKeyToDb(today) }, status: { in: ["CONFIRMED", "IN_PREPARATION", "READY"] } },
      _sum: { total: true },
      _count: { _all: true },
    }),
    db.$queryRaw<
      { paid: number; cancelled_restaurant: number; cancelled_customer: number; active: number; revenue: number; savings: number }[]
    >`
      SELECT
        count(*)::int AS paid,
        count(*) FILTER (WHERE status = 'CANCELLED_BY_RESTAURANT')::int AS cancelled_restaurant,
        count(*) FILTER (WHERE status = 'CANCELLED_BY_CUSTOMER')::int AS cancelled_customer,
        count(*) FILTER (WHERE status IN ${ACTIVE})::int AS active,
        coalesce(sum(total) FILTER (WHERE status IN ${ACTIVE}), 0)::int AS revenue,
        coalesce(sum("discountAmount") FILTER (WHERE status IN ${ACTIVE}), 0)::int AS savings
      FROM "Order"
      WHERE "restaurantId" = ${restaurantId} AND "confirmedAt" IS NOT NULL AND "confirmedAt" >= ${periodStart}`,
    db.subscription.findMany({
      where: { restaurantId, status: "ACTIVE", periodEnd: { gte: dateKeyToDb(today) } },
      distinct: ["customerId"],
      select: { customerId: true },
    }),
    db.$queryRaw<{ dishId: string; dishName: string; units: number }[]>`
      SELECT oi."dishId", coalesce(d.name, max(oi."dishName")) AS "dishName", sum(oi.quantity)::int AS units
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      LEFT JOIN "Dish" d ON d.id = oi."dishId"
      WHERE o."restaurantId" = ${restaurantId} AND o.status IN ${ACTIVE} AND o."confirmedAt" >= ${periodStart}
      GROUP BY oi."dishId", d.name`,
    db.$queryRaw<{ dishId: string; optionId: string; groupName: string; optionName: string; quantity: number }[]>`
      SELECT oi."dishId", m."optionId", max(m."groupName") AS "groupName", max(m."optionName") AS "optionName",
             sum(oi.quantity)::int AS quantity
      FROM "OrderItemModifier" m
      JOIN "OrderItem" oi ON oi.id = m."orderItemId"
      JOIN "Order" o ON o.id = oi."orderId"
      WHERE o."restaurantId" = ${restaurantId} AND o.status IN ${ACTIVE} AND o."confirmedAt" >= ${periodStart}
      GROUP BY oi."dishId", m."optionId"`,
    db.$queryRaw<{ dishId: string; dishName: string; date: string; quantity: number }[]>`
      SELECT oi."dishId", coalesce(d.name, max(oi."dishName")) AS "dishName", o."serviceDate"::text AS date,
             sum(oi.quantity)::int AS quantity
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      LEFT JOIN "Dish" d ON d.id = oi."dishId"
      WHERE o."restaurantId" = ${restaurantId} AND o.status IN ${ACTIVE}
        AND o."serviceDate" >= ${today}::date AND o."serviceDate" <= ${horizonEnd}::date
      GROUP BY oi."dishId", d.name, o."serviceDate"`,
  ]);

  const p = periodAgg[0];
  const upcomingCounts = new Map<DateKey, number>(upcoming.map((u) => [dbDateToKey(u.serviceDate), u._count._all]));
  const unitsMap = new Map(dishUnits.map((d) => [d.dishId, { name: d.dishName, units: d.units }]));

  return {
    today,
    period,
    periodStart,
    upcoming: dailySeries(today, 7, upcomingCounts),
    advance: { amount: advance._sum.total ?? 0, orders: advance._count._all },
    periodTotals: {
      paid: p.paid,
      active: p.active,
      revenue: p.revenue,
      savings: p.savings,
      cancelledByRestaurant: p.cancelled_restaurant,
      cancelledByCustomer: p.cancelled_customer,
      restaurantCancelRateBps: rateBps(p.cancelled_restaurant, p.paid),
    },
    subscribers: subscribers.length,
    topDishes: topN(
      dishUnits.map((d) => ({ id: d.dishId, label: d.dishName, value: d.units })),
      5,
    ),
    topModifiers: topModifiersByDish(
      modifierPicks.map((m) => ({ ...m, dishName: unitsMap.get(m.dishId)?.name ?? "" })),
      unitsMap,
    ),
    forecast: { dates: nextDays, rows: forecastMatrix(forecastRows, nextDays) },
  };
}

export type RestaurantDashboard = Awaited<ReturnType<typeof getRestaurantDashboard>>;
