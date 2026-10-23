import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { Fulfillment, SlotScope } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { computeAvailableDates, slotRemaining } from "@/modules/availability/dates";
import { ensureDayMaterialized } from "@/modules/availability/materialize";
import type { ModifierGroupDef } from "@/modules/menu/modifiers";
import type { DishNutrition } from "@/modules/menu/nutrition";
import { DISH_MENU_INCLUDE, dishNutrition, toGroupDefs } from "@/modules/orders/menu-defs";
import { advanceDiscountBps, hoursBetween, type DiscountTier } from "@/modules/orders/pricing";
import { HOLDING_CONDITION_SQL } from "@/modules/orders/statuses";
import { addDays, dateKeyToDb, dbDateToKey, todayKey, zonedInstant, type DateKey } from "@/modules/shared/time";

// Consultas públicas del catálogo (sin sesión). Los números de cupo y stock
// son informativos: la verdad se vuelve a verificar con bloqueos al reservar.

export type RestaurantFilters = { zone?: string; cuisine?: string; modality?: Fulfillment };

export async function getCatalogFilters() {
  const [zones, cuisines] = await Promise.all([
    db.zone.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true } }),
    db.cuisineType.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true } }),
  ]);
  return { zones, cuisines };
}

export async function listRestaurants(filters: RestaurantFilters) {
  const where: Prisma.RestaurantWhereInput = { status: "ACTIVE" };
  const and: Prisma.RestaurantWhereInput[] = [];
  if (filters.zone) {
    // "Zona": el local está ahí o hace delivery a esa zona.
    and.push({
      OR: [{ zone: { slug: filters.zone } }, { deliveryEnabled: true, deliveryZones: { some: { zone: { slug: filters.zone } } } }],
    });
  }
  if (filters.cuisine) and.push({ cuisines: { some: { slug: filters.cuisine } } });
  if (filters.modality === "PICKUP") and.push({ pickupEnabled: true });
  if (filters.modality === "DELIVERY") and.push({ deliveryEnabled: true });
  if (and.length) where.AND = and;

  const rows = await db.restaurant.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      coverUrl: true,
      logoUrl: true,
      pickupEnabled: true,
      deliveryEnabled: true,
      zone: { select: { name: true, slug: true } },
      cuisines: { select: { name: true, slug: true } },
      deliveryZones: { select: { fee: true, zone: { select: { name: true, slug: true } } } },
      discountTiers: { select: { discountBps: true, minHoursBefore: true } },
      planConfig: { select: { enabled: true, discountBps: true } },
    },
  });
  return rows.map((r) => ({
    ...r,
    maxAdvanceDiscountBps: r.discountTiers.reduce((m, t) => Math.max(m, t.discountBps), 0),
    hasMonthlyPlan: Boolean(r.planConfig?.enabled),
    deliveryFeeForZone: filters.zone ? r.deliveryZones.find((z) => z.zone.slug === filters.zone)?.fee ?? null : null,
  }));
}

export type StorefrontRestaurant = NonNullable<Awaited<ReturnType<typeof getStorefrontRestaurant>>>;

export async function getStorefrontRestaurant(slug: string) {
  return db.restaurant.findFirst({
    where: { slug, status: "ACTIVE" },
    include: {
      zone: { select: { name: true } },
      cuisines: { select: { name: true } },
      discountTiers: { orderBy: { minHoursBefore: "asc" } },
      deliveryZones: { include: { zone: { select: { id: true, name: true } } } },
      planConfig: { select: { enabled: true, discountBps: true } },
    },
  });
}

/** Días pedibles (selector de fecha). */
export async function getAvailableDates(
  r: Pick<StorefrontRestaurant, "id" | "maxDaysAhead" | "cutoffDaysBefore" | "cutoffMinute">,
  now: Date,
): Promise<DateKey[]> {
  const today = todayKey(now);
  const last = addDays(today, r.maxDaysAhead);
  const [templates, closures, slots] = await Promise.all([
    db.timeSlotTemplate.findMany({ where: { restaurantId: r.id, isActive: true }, select: { weekday: true } }),
    db.restaurantClosure.findMany({
      where: { restaurantId: r.id, date: { gte: dateKeyToDb(today), lte: dateKeyToDb(last) } },
      select: { date: true },
    }),
    db.dailySlot.findMany({
      where: { restaurantId: r.id, date: { gte: dateKeyToDb(today), lte: dateKeyToDb(last) } },
      select: { date: true, isClosed: true },
    }),
  ]);
  const materialized = new Map<DateKey, boolean>();
  for (const s of slots) {
    const key = dbDateToKey(s.date);
    materialized.set(key, (materialized.get(key) ?? false) || !s.isClosed);
  }
  return computeAvailableDates({
    now,
    maxDaysAhead: r.maxDaysAhead,
    cutoffDaysBefore: r.cutoffDaysBefore,
    cutoffMinute: r.cutoffMinute,
    templateWeekdays: new Set(templates.map((t) => t.weekday)),
    closures: new Set(closures.map((c) => dbDateToKey(c.date))),
    materialized,
  });
}

export type MenuSlot = { id: string; startMinute: number; endMinute: number; scope: SlotScope; remaining: number };

export type MenuDish = {
  id: string;
  name: string;
  description: string | null;
  photoUrl: string | null;
  basePrice: number;
  allowNotes: boolean;
  category: string;
  categoryOrder: number;
  sortOrder: number;
  nutrition: DishNutrition;
  /** grupos vigentes; las opciones agotadas ese día vienen con isActive = false */
  groups: ModifierGroupDef[];
  remaining: number;
  /** stock restante de opciones con stock diario (solo esas) */
  optionRemaining: Record<string, number>;
};

export type DayMenu = {
  date: DateKey;
  slots: MenuSlot[];
  dishes: MenuDish[];
  /** descuento estimado con la primera franja libre */
  estimatedDiscountBps: number;
  tiers: DiscountTier[];
};

const HOLDING = Prisma.raw(HOLDING_CONDITION_SQL);

/**
 * Menú de un día: solo platos con stock y franjas con lugar. Materializa el
 * día antes de leer (idempotente), igual que el checkout.
 */
export async function getDayMenu(r: Pick<StorefrontRestaurant, "id" | "discountTiers">, date: DateKey, now: Date): Promise<DayMenu> {
  await db.$transaction((tx) => ensureDayMaterialized(tx, r.id, date));
  const day = dateKeyToDb(date);

  const [slotRows, slotHeld, stockRows, dishSold, optionStock, optionSold] = await Promise.all([
    db.dailySlot.findMany({ where: { restaurantId: r.id, date: day }, orderBy: [{ startMinute: "asc" }, { scope: "asc" }] }),
    db.$queryRaw<{ slotId: string; held: bigint }[]>`
      SELECT "slotId", count(*) AS held FROM "Order"
      WHERE "restaurantId" = ${r.id} AND "serviceDate" = ${date}::date AND ${HOLDING}
      GROUP BY "slotId"`,
    db.dailyDishStock.findMany({
      where: { restaurantId: r.id, date: day, isClosed: false, dish: { isActive: true, deletedAt: null } },
      include: { dish: { include: { ...DISH_MENU_INCLUDE, category: true } } },
    }),
    db.$queryRaw<{ dishId: string; sold: bigint }[]>`
      SELECT oi."dishId", sum(oi."quantity") AS sold
      FROM "OrderItem" oi JOIN "Order" o ON o."id" = oi."orderId"
      WHERE o."restaurantId" = ${r.id} AND o."serviceDate" = ${date}::date AND ${HOLDING}
      GROUP BY oi."dishId"`,
    db.optionDailyStock.findMany({ where: { date: day, option: { group: { restaurantId: r.id } } }, select: { optionId: true, stock: true } }),
    db.$queryRaw<{ optionId: string; sold: bigint }[]>`
      SELECT m."optionId", sum(oi."quantity") AS sold
      FROM "OrderItemModifier" m JOIN "OrderItem" oi ON oi."id" = m."orderItemId" JOIN "Order" o ON o."id" = oi."orderId"
      WHERE o."restaurantId" = ${r.id} AND o."serviceDate" = ${date}::date AND ${HOLDING}
      GROUP BY m."optionId"`,
  ]);

  const heldBy = new Map(slotHeld.map((s) => [s.slotId, Number(s.held)]));
  const slots: MenuSlot[] = slotRows
    .map((s) => ({
      id: s.id,
      startMinute: s.startMinute,
      endMinute: s.endMinute,
      scope: s.scope,
      remaining: slotRemaining({ ...s, held: heldBy.get(s.id) ?? 0 }, date, now),
    }))
    .filter((s) => s.remaining > 0);

  const soldDish = new Map(dishSold.map((d) => [d.dishId, Number(d.sold)]));
  const soldOption = new Map(optionSold.map((o) => [o.optionId, Number(o.sold)]));
  const optionLeft = new Map(optionStock.map((o) => [o.optionId, Math.max(0, o.stock - (soldOption.get(o.optionId) ?? 0))]));

  const dishes: MenuDish[] = [];
  for (const row of stockRows) {
    const remaining = row.stock - (soldDish.get(row.dishId) ?? 0);
    if (remaining <= 0) continue;
    const d = row.dish;
    const limited = new Set<string>();
    for (const l of d.modifierGroups) for (const o of l.group.options) if (o.dailyStock !== null) limited.add(o.id);
    const optionRemaining: Record<string, number> = {};
    for (const id of limited) optionRemaining[id] = optionLeft.get(id) ?? 0;
    const groups = toGroupDefs(d.modifierGroups).map((g) => ({
      ...g,
      options: g.options.map((o) => (limited.has(o.id) && optionRemaining[o.id] <= 0 ? { ...o, isActive: false } : o)),
    }));
    dishes.push({
      id: d.id,
      name: d.name,
      description: d.description,
      photoUrl: d.photoUrl,
      basePrice: d.basePrice,
      allowNotes: d.allowNotes,
      category: d.category?.name ?? "Otros",
      categoryOrder: d.category?.sortOrder ?? 999,
      sortOrder: d.sortOrder,
      nutrition: dishNutrition(d),
      groups,
      remaining,
      optionRemaining,
    });
  }
  dishes.sort((a, b) => a.categoryOrder - b.categoryOrder || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const firstSlot = slots[0];
  const estimatedDiscountBps = firstSlot ? advanceDiscountBps(r.discountTiers, hoursBetween(now, zonedInstant(date, firstSlot.startMinute))) : 0;
  return {
    date,
    slots,
    dishes,
    estimatedDiscountBps,
    tiers: r.discountTiers.map((t) => ({ minHoursBefore: t.minHoursBefore, discountBps: t.discountBps })),
  };
}

/** Preferencias del cliente para precargar modificadores (RF-C7). */
export async function getPreferenceSets(userId: string | null, dishIds: string[]) {
  if (!userId) return { tagIds: [] as string[], dishOptionIds: {} as Record<string, string[]> };
  const prefs = await db.customerPreference.findMany({
    where: { userId, OR: [{ scope: "GENERAL" }, { scope: "DISH", dishId: { in: dishIds } }] },
    select: { scope: true, tagId: true, dishId: true, optionId: true },
  });
  const dishOptionIds: Record<string, string[]> = {};
  const tagIds: string[] = [];
  for (const p of prefs) {
    if (p.scope === "GENERAL" && p.tagId) tagIds.push(p.tagId);
    if (p.scope === "DISH" && p.dishId && p.optionId) (dishOptionIds[p.dishId] ??= []).push(p.optionId);
  }
  return { tagIds, dishOptionIds };
}
