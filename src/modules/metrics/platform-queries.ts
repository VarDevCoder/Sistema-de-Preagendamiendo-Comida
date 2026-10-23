import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import type { OrderStatus, RestaurantStatus } from "@/generated/prisma/enums";
import { addDays, todayKey, zonedInstant } from "@/modules/shared/time";
import { rateBps, type PeriodDays } from "./calc";

// Métricas globales del super admin (RF-A5).
// - GMV: total de los pedidos pagos en el período (por fecha de pago), aunque después se cancelen.
// - Comisiones, penalidades y reembolsos: netos según el ledger en el período (fuente contable).
// - Saldo en billeteras: pasivo total con los clientes (todo el historial).

const PAID = Prisma.sql`('CONFIRMED','IN_PREPARATION','READY','DELIVERED','CANCELLED_BY_RESTAURANT','CANCELLED_BY_CUSTOMER')`;

export async function getPlatformMetrics(period: PeriodDays, now: Date = new Date()) {
  const today = todayKey(now);
  const periodStart = zonedInstant(addDays(today, -(period - 1)), 0);

  const [orderAgg, byStatus, ledger, walletTotal, restaurants, customers, newCustomers, perRestaurant, openClaims] =
    await Promise.all([
      db.$queryRaw<{ gmv: number; paid: number; cancelled_restaurant: number; savings: number }[]>`
        SELECT coalesce(sum(total), 0)::int AS gmv, count(*)::int AS paid,
               count(*) FILTER (WHERE status = 'CANCELLED_BY_RESTAURANT')::int AS cancelled_restaurant,
               coalesce(sum("discountAmount"), 0)::int AS savings
        FROM "Order"
        WHERE status IN ${PAID} AND "confirmedAt" >= ${periodStart}`,
      db.order.groupBy({ by: ["status"], where: { createdAt: { gte: periodStart } }, _count: { _all: true } }),
      db.$queryRaw<{ type: string; tx_type: string; amount: number }[]>`
        SELECT a.type::text AS type, t.type::text AS tx_type, coalesce(sum(e.amount), 0)::int AS amount
        FROM "LedgerEntry" e
        JOIN "LedgerAccount" a ON a.id = e."accountId"
        JOIN "LedgerTransaction" t ON t.id = e."transactionId"
        WHERE t."createdAt" >= ${periodStart}
        GROUP BY a.type, t.type`,
      db.$queryRaw<{ amount: number }[]>`
        SELECT coalesce(-sum(e.amount), 0)::int AS amount
        FROM "LedgerEntry" e JOIN "LedgerAccount" a ON a.id = e."accountId"
        WHERE a.type = 'CUSTOMER_WALLET'`,
      db.restaurant.groupBy({ by: ["status"], _count: { _all: true } }),
      db.user.count({ where: { role: "CUSTOMER" } }),
      db.user.count({ where: { role: "CUSTOMER", createdAt: { gte: periodStart } } }),
      db.$queryRaw<{ id: string; name: string; slug: string; status: RestaurantStatus; gmv: number; paid: number; cancelled_restaurant: number }[]>`
        SELECT r.id, r.name, r.slug, r.status,
               coalesce(sum(o.total), 0)::int AS gmv, count(o.id)::int AS paid,
               count(o.id) FILTER (WHERE o.status = 'CANCELLED_BY_RESTAURANT')::int AS cancelled_restaurant
        FROM "Restaurant" r
        LEFT JOIN "Order" o ON o."restaurantId" = r.id AND o.status IN ${PAID} AND o."confirmedAt" >= ${periodStart}
        GROUP BY r.id
        ORDER BY gmv DESC, r.name ASC`,
      db.claim.count({ where: { status: { in: ["OPEN", "IN_REVIEW"] } } }),
    ]);

  const sumLedger = (accountType: string, txTypes?: string[]) =>
    ledger.filter((l) => l.type === accountType && (!txTypes || txTypes.includes(l.tx_type))).reduce((a, l) => a + l.amount, 0);

  const o = orderAgg[0];
  const statusCounts = new Map<OrderStatus, number>(byStatus.map((s) => [s.status, s._count._all]));
  const restaurantCounts = new Map<RestaurantStatus, number>(restaurants.map((r) => [r.status, r._count._all]));

  return {
    period,
    periodStart,
    gmv: o.gmv,
    paidOrders: o.paid,
    customerSavings: o.savings,
    // Ingresos = créditos (negativos) en las cuentas de ingreso → se invierte el signo.
    commissions: -sumLedger("PLATFORM_COMMISSION"),
    penalties: -sumLedger("PLATFORM_PENALTY"),
    walletRefunds: -sumLedger("CUSTOMER_WALLET", ["REFUND_TO_WALLET", "CLAIM_REFUND"]),
    goodwill: sumLedger("PLATFORM_GOODWILL"),
    cancelledByRestaurant: o.cancelled_restaurant,
    cancelRateBps: rateBps(o.cancelled_restaurant, o.paid),
    walletLiability: walletTotal[0]?.amount ?? 0,
    statusCounts,
    restaurantCounts,
    restaurantsTotal: restaurants.reduce((a, r) => a + r._count._all, 0),
    customers,
    newCustomers,
    openClaims,
    perRestaurant: perRestaurant.map((r) => ({ ...r, cancelRateBps: rateBps(r.cancelled_restaurant, r.paid) })),
  };
}

export type PlatformMetrics = Awaited<ReturnType<typeof getPlatformMetrics>>;
