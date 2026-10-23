import "server-only";
import { db } from "@/lib/db";
import { dateKeyToDb, todayKey } from "@/modules/shared/time";

// Lecturas del super admin. Quien llama ya verificó requireUser(["SUPER_ADMIN"]).

export async function listRestaurantsForAdmin() {
  return db.restaurant.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      commissionBps: true,
      restaurantCancelRefundsCommission: true,
      restaurantCancelPenaltyBps: true,
      macrosRequired: true,
      zone: { select: { name: true } },
      members: { select: { user: { select: { email: true } } } },
    },
  });
}

export async function getRestaurantForAdmin(id: string) {
  const restaurant = await db.restaurant.findUnique({
    where: { id },
    include: {
      zone: { select: { name: true } },
      members: { include: { user: { select: { id: true, name: true, email: true, isActive: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!restaurant) return null;
  const [pendingPaid, audit] = await Promise.all([
    db.order.count({
      where: { restaurantId: id, serviceDate: { gte: dateKeyToDb(todayKey()) }, status: { in: ["CONFIRMED", "IN_PREPARATION", "READY"] } },
    }),
    db.auditLog.findMany({
      where: { entityType: "Restaurant", entityId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { actor: { select: { name: true, email: true } } },
    }),
  ]);
  return { restaurant, pendingPaid, audit };
}

export async function listZones() {
  return db.zone.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
}

export async function getDefaultCommissionBps() {
  const s = await db.platformSettings.findUnique({ where: { id: 1 }, select: { defaultCommissionBps: true } });
  return s?.defaultCommissionBps ?? 1000;
}
