// Seed de desarrollo: 3 restaurantes, 10 clientes, pedidos de prueba y 2 planes mensuales.
// Los pedidos se arman con las MISMAS funciones de dominio que usa la app
// (precios, macros, modificadores, asientos contables), así los datos son coherentes.
//
// Uso: npm run db:reset  (borra la base, aplica migraciones y corre este seed)
//      npm run db:seed   (solo sobre una base vacía)

import { db } from "../src/lib/db";
import type { Fulfillment, OrderStatus, PaymentProviderKind, SlotScope } from "../src/generated/prisma/enums";
import { hashPassword } from "../src/modules/auth/password";
import {
  modifierKey,
  modifierSummary,
  preloadSelection,
  validateSelection,
  type ModifierGroupDef,
} from "../src/modules/menu/modifiers";
import { itemNutrition, sumNutrition, ZERO_DELTA, type DishNutrition } from "../src/modules/menu/nutrition";
import { advanceDiscountBps, hoursBetween, priceLine, priceOrder } from "../src/modules/orders/pricing";
import { applyBps } from "../src/modules/shared/money";
import {
  addDays,
  cutoffInstant,
  dateKeyToDb,
  eachDay,
  isoWeekday,
  monthBounds,
  nextMonthStart,
  parseMinute,
  todayKey,
  zonedInstant,
  type DateKey,
} from "../src/modules/shared/time";
import {
  partialRefundEntries,
  paymentCapturedEntries,
  restaurantCancelEntries,
} from "../src/modules/wallet/entries";
import { lockWalletBalance, postLedgerTransaction, type Tx } from "../src/modules/wallet/ledger-tx";
import { CUSTOMERS, CUISINES, NOTES, PREFERENCE_TAGS, RESTAURANTS, ZONES, type RestaurantDef } from "./seed/catalog";

const PASSWORD = "demo1234";

// ---------------------------------------------------------------------------
// Aleatoriedad determinística (mismo seed → mismos datos)
// ---------------------------------------------------------------------------
let state = 20261022;
function random() {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(random() * arr.length)];
const chance = (p: number) => random() < p;
const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const usedCodes = new Set<string>();
function newCode(): string {
  for (;;) {
    const raw = Array.from({ length: 6 }, () => pick(CODE_ALPHABET.split(""))).join("");
    const code = `${raw.slice(0, 3)}-${raw.slice(3)}`;
    if (!usedCodes.has(code)) {
      usedCodes.add(code);
      return code;
    }
  }
}

// ---------------------------------------------------------------------------
// Estado en memoria del catálogo creado
// ---------------------------------------------------------------------------
type DishCtx = {
  key: string;
  id: string;
  name: string;
  basePrice: number;
  allowNotes: boolean;
  nutrition: DishNutrition;
  groups: ModifierGroupDef[];
  weekdays: number[];
};

type SlotState = {
  id: string;
  startMinute: number;
  endMinute: number;
  capacity: number;
  scope: SlotScope;
  used: number;
};

type RestaurantCtx = {
  def: RestaurantDef;
  id: string;
  dishes: Map<string, DishCtx>;
  optionIds: Map<string, string>; // "grupo/opcion" → id
  optionStockLimit: Map<string, number>; // optionId → stock diario
  deliveryFees: Map<string, number>; // zoneId → fee
  tiers: { minHoursBefore: number; discountBps: number }[];
  slots: Map<DateKey, SlotState[]>;
  dishStock: Map<string, { stock: number; used: number }>; // `${dishId}|${date}`
  optionStock: Map<string, { stock: number; used: number }>; // `${optionId}|${date}`
};

type CustomerCtx = {
  key: string;
  id: string;
  name: string;
  zoneId: string;
  address: { label: string; street: string; zone: string };
  allergens: (typeof CUSTOMERS)[number]["allergens"];
  allergyOther: string | null;
  tagIds: Set<string>;
  dishOptionIds: Set<string>;
};

type ItemInput = { dish: DishCtx; optionIds: string[]; quantity: number; notes?: string };

// ---------------------------------------------------------------------------
// Pedido: cálculo puro (igual que el checkout) + inserción
// ---------------------------------------------------------------------------
type OrderDraft = ReturnType<typeof draftOrder>;

function draftOrder(p: {
  r: RestaurantCtx;
  customer: CustomerCtx;
  date: DateKey;
  slot: SlotState;
  fulfillment: Fulfillment;
  items: ItemInput[];
  createdAt: Date;
  planDiscountBps?: number;
}) {
  const lines = p.items.map((item) => {
    const result = validateSelection(item.dish.groups, item.optionIds);
    if (!result.ok) throw new Error(`Selección inválida para ${item.dish.name}: ${result.errors[0].message}`);
    const price = priceLine({
      basePrice: item.dish.basePrice,
      priceDeltas: result.selected.map((s) => s.option.priceDelta),
      quantity: item.quantity,
    });
    const nutrition = itemNutrition(
      item.dish.nutrition,
      result.selected.map((s) => s.option),
    );
    return { item, selected: result.selected, price, nutrition };
  });

  const slotStart = zonedInstant(p.date, p.slot.startMinute);
  const discountBps =
    p.planDiscountBps ?? advanceDiscountBps(p.r.tiers, hoursBetween(p.createdAt, slotStart));
  const deliveryFee = p.fulfillment === "DELIVERY" ? (p.r.deliveryFees.get(p.customer.zoneId) ?? 0) : 0;
  const price = priceOrder({
    lineListTotals: lines.map((l) => l.price.lineListTotal),
    discountBps,
    deliveryFee,
    commissionBps: p.r.def.commissionBps,
  });
  const nutrition = sumNutrition(lines.map((l) => ({ nutrition: l.nutrition, quantity: l.item.quantity })));

  return { ...p, lines, price, nutrition, discountBps, kind: p.planDiscountBps === undefined ? "SINGLE" : "PLAN_DAY" };
}

function canFit(d: Pick<OrderDraft, "r" | "date" | "slot" | "items">): boolean {
  if (d.slot.used >= d.slot.capacity) return false;
  const needDish = new Map<string, number>();
  const needOption = new Map<string, number>();
  for (const it of d.items) {
    needDish.set(it.dish.id, (needDish.get(it.dish.id) ?? 0) + it.quantity);
    for (const o of it.optionIds) {
      if (d.r.optionStockLimit.has(o)) needOption.set(o, (needOption.get(o) ?? 0) + it.quantity);
    }
  }
  for (const [dishId, qty] of needDish) {
    const s = d.r.dishStock.get(`${dishId}|${d.date}`);
    if (!s || s.used + qty > s.stock) return false;
  }
  for (const [optionId, qty] of needOption) {
    const s = d.r.optionStock.get(`${optionId}|${d.date}`);
    if (!s || s.used + qty > s.stock) return false;
  }
  return true;
}

function reserve(d: OrderDraft) {
  d.slot.used += 1;
  for (const it of d.items) {
    d.r.dishStock.get(`${it.dish.id}|${d.date}`)!.used += it.quantity;
    for (const o of it.optionIds) {
      const s = d.r.optionStock.get(`${o}|${d.date}`);
      if (s) s.used += it.quantity;
    }
  }
}

const minutes = (date: Date, m: number) => new Date(date.getTime() + m * 60_000);

async function insertOrder(
  tx: Tx,
  d: OrderDraft,
  status: OrderStatus,
  opts: { subscriptionId?: string; cancelReason?: string } = {},
) {
  const confirmedAt = minutes(d.createdAt, 1);
  const slotStart = zonedInstant(d.date, d.slot.startMinute);
  const timeline: { to: OrderStatus; at: Date; reason?: string }[] = [{ to: "PENDING_PAYMENT", at: d.createdAt }];
  const stamps: Partial<Record<"confirmedAt" | "inPreparationAt" | "readyAt" | "deliveredAt" | "cancelledAt", Date>> = {};

  if (status === "EXPIRED") {
    timeline.push({ to: "EXPIRED", at: minutes(d.createdAt, 10) });
  } else {
    timeline.push({ to: "CONFIRMED", at: confirmedAt });
    stamps.confirmedAt = confirmedAt;
    const flow: OrderStatus[] = ["IN_PREPARATION", "READY", "DELIVERED"];
    const target = flow.indexOf(status);
    flow.slice(0, target + 1).forEach((s, i) => {
      const at = minutes(slotStart, -40 + i * 25);
      timeline.push({ to: s, at });
      stamps[s === "IN_PREPARATION" ? "inPreparationAt" : s === "READY" ? "readyAt" : "deliveredAt"] = at;
    });
    if (status === "CANCELLED_BY_RESTAURANT" || status === "CANCELLED_BY_CUSTOMER") {
      const at = minutes(confirmedAt, 180);
      timeline.push({ to: status, at, reason: opts.cancelReason });
      stamps.cancelledAt = at;
    }
  }

  const customer = d.customer;
  return tx.order.create({
    data: {
      code: newCode(),
      customerId: customer.id,
      restaurantId: d.r.id,
      kind: d.kind as "SINGLE" | "PLAN_DAY",
      subscriptionId: opts.subscriptionId,
      serviceDate: dateKeyToDb(d.date),
      slotId: d.slot.id,
      slotStartMinute: d.slot.startMinute,
      slotEndMinute: d.slot.endMinute,
      fulfillment: d.fulfillment,
      deliveryAddress: d.fulfillment === "DELIVERY" ? customer.address : undefined,
      cutoffAt: cutoffInstant(d.date, d.r.def.cutoffDaysBefore, d.r.def.cutoffMinute),
      status,
      holdExpiresAt: minutes(d.createdAt, 10),
      itemsSubtotal: d.price.itemsSubtotal,
      discountKind: d.discountBps === 0 ? "NONE" : d.kind === "PLAN_DAY" ? "MONTHLY_PLAN" : "ADVANCE",
      discountBps: d.discountBps,
      discountAmount: d.price.discountAmount,
      deliveryFee: d.price.deliveryFee,
      total: d.price.total,
      commissionBps: d.r.def.commissionBps,
      commissionAmount: d.price.commissionAmount,
      nutritionComplete: d.nutrition.complete,
      kcal: d.nutrition.totals?.kcal,
      proteinG: d.nutrition.totals?.proteinG,
      carbsG: d.nutrition.totals?.carbsG,
      fatG: d.nutrition.totals?.fatG,
      fiberG: d.nutrition.totals?.fiberG,
      sugarG: d.nutrition.totals?.sugarG,
      sodiumMg: d.nutrition.totals?.sodiumMg,
      allergens: customer.allergens,
      allergyOther: customer.allergyOther,
      cancelReason: opts.cancelReason,
      createdAt: d.createdAt,
      ...stamps,
      items: {
        create: d.lines.map((l, i) => ({
          dishId: l.item.dish.id,
          quantity: l.item.quantity,
          dishName: l.item.dish.name,
          unitBasePrice: l.price.unitBasePrice,
          unitModifiersTotal: l.price.unitModifiersTotal,
          unitListPrice: l.price.unitListPrice,
          lineListTotal: l.price.lineListTotal,
          lineDiscount: d.price.lineDiscounts[i],
          lineTotal: d.price.lineTotals[i],
          modifierKey: modifierKey(l.selected.map((s) => s.option.id)),
          modifierSummary: modifierSummary(l.selected),
          notes: l.item.notes,
          servingGrams: l.nutrition?.servingGrams,
          kcal: l.nutrition?.kcal,
          proteinG: l.nutrition?.proteinG,
          carbsG: l.nutrition?.carbsG,
          fatG: l.nutrition?.fatG,
          fiberG: l.nutrition?.fiberG,
          sugarG: l.nutrition?.sugarG,
          sodiumMg: l.nutrition?.sodiumMg,
          modifiers: {
            create: l.selected.map((s, j) => ({
              optionId: s.option.id,
              groupId: s.group.id,
              groupName: s.group.name,
              optionName: s.option.name,
              priceDelta: s.option.priceDelta,
              sortOrder: j,
              kcalDelta: s.option.kcalDelta,
              proteinDeltaG: s.option.proteinDeltaG,
              carbsDeltaG: s.option.carbsDeltaG,
              fatDeltaG: s.option.fatDeltaG,
              fiberDeltaG: s.option.fiberDeltaG,
              sugarDeltaG: s.option.sugarDeltaG,
              sodiumDeltaMg: s.option.sodiumDeltaMg,
            })),
          },
        })),
      },
      events: {
        create: timeline.map((t, i) => ({
          fromStatus: i === 0 ? null : timeline[i - 1].to,
          toStatus: t.to,
          reason: t.reason,
          createdAt: t.at,
        })),
      },
    },
  });
}

/** Pago aprobado (mock y/o billetera) + asiento contable. */
async function capturePayment(
  tx: Tx,
  p: {
    customerId: string;
    restaurantId: string;
    amount: number;
    commissionAmount: number;
    useWallet?: boolean;
    orderId?: string;
    subscriptionId?: string;
    reference: string;
    at: Date;
  },
) {
  const balance = p.useWallet ? await lockWalletBalance(tx, p.customerId) : 0;
  const walletAmount = Math.min(balance, p.amount);
  const gatewayAmount = p.amount - walletAmount;
  const provider: PaymentProviderKind = gatewayAmount === 0 ? "WALLET" : "MOCK";
  const payment = await tx.payment.create({
    data: {
      customerId: p.customerId,
      purpose: p.subscriptionId ? "SUBSCRIPTION" : "ORDER",
      orderId: p.orderId,
      subscriptionId: p.subscriptionId,
      amount: p.amount,
      walletAmount,
      gatewayAmount,
      provider,
      providerRef: provider === "MOCK" ? `mock_${p.reference}` : null,
      status: "APPROVED",
      idempotencyKey: `seed:${p.reference}`,
      expiresAt: minutes(p.at, 10),
      approvedAt: minutes(p.at, 1),
      createdAt: p.at,
    },
  });
  await postLedgerTransaction(tx, {
    type: "PAYMENT_CAPTURED",
    description: `Pago ${p.reference}`,
    idempotencyKey: `payment:${payment.id}:captured`,
    paymentId: payment.id,
    orderId: p.orderId,
    subscriptionId: p.subscriptionId,
    entries: paymentCapturedEntries({
      userId: p.customerId,
      restaurantId: p.restaurantId,
      gatewayAmount,
      walletAmount,
      commissionAmount: p.commissionAmount,
    }),
  });
  return payment;
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------
async function createCatalog(ownerIds: Map<string, string>, tagIds: Map<string, string>, zoneIds: Map<string, string>, cuisineIds: Map<string, string>) {
  const out: RestaurantCtx[] = [];
  for (const def of RESTAURANTS) {
    const restaurant = await db.restaurant.create({
      data: {
        slug: def.slug,
        name: def.name,
        description: def.description,
        addressLine: def.addressLine,
        phone: def.phone,
        zoneId: zoneIds.get(def.zone)!,
        status: "ACTIVE",
        pickupEnabled: def.pickupEnabled,
        deliveryEnabled: def.deliveryEnabled,
        cutoffDaysBefore: def.cutoffDaysBefore,
        cutoffMinute: def.cutoffMinute,
        commissionBps: def.commissionBps,
        restaurantCancelRefundsCommission: def.restaurantCancelRefundsCommission,
        restaurantCancelPenaltyBps: def.restaurantCancelPenaltyBps,
        customerCancelRefundBps: def.customerCancelRefundBps,
        macrosRequired: def.macrosRequired,
        cuisines: { connect: def.cuisines.map((c) => ({ id: cuisineIds.get(c)! })) },
        members: { create: { userId: ownerIds.get(def.key)!, role: "OWNER" } },
        openingHours: {
          create: def.openingHours.flatMap((h) =>
            h.weekdays.map((weekday) => ({ weekday, opensMinute: parseMinute(h.open), closesMinute: parseMinute(h.close) })),
          ),
        },
        deliveryZones: { create: def.deliveryZones.map((z) => ({ zoneId: zoneIds.get(z.zone)!, fee: z.fee })) },
        discountTiers: { create: def.discountTiers },
        planConfig: def.plan ? { create: { enabled: true, ...def.plan } } : undefined,
        categories: { create: def.categories.map((name, sortOrder) => ({ name, sortOrder })) },
        slotTemplates: {
          create: def.slots.flatMap((s) =>
            s.weekdays.map((weekday) => ({
              weekday,
              startMinute: parseMinute(s.start),
              endMinute: parseMinute(s.end),
              capacity: s.capacity,
              scope: s.scope,
            })),
          ),
        },
      },
      include: { categories: true },
    });

    // Grupos y opciones (reutilizables entre platos)
    const groupIds = new Map<string, string>();
    const optionIds = new Map<string, string>();
    const optionStockLimit = new Map<string, number>();
    const groupDefs = new Map<string, Omit<ModifierGroupDef, "sortOrder">>();
    for (const g of def.groups) {
      const group = await db.modifierGroup.create({
        data: {
          restaurantId: restaurant.id,
          name: g.name,
          required: g.required,
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          options: {
            create: g.options.map((o, sortOrder) => ({
              name: o.name,
              priceDelta: o.priceDelta ?? 0,
              isDefault: o.isDefault ?? false,
              sortOrder,
              dailyStock: o.dailyStock,
              preferenceTagId: o.tag ? tagIds.get(o.tag) : undefined,
              ...ZERO_DELTA,
              ...o.delta,
            })),
          },
        },
        include: { options: true },
      });
      groupIds.set(g.key, group.id);
      g.options.forEach((o) => {
        const created = group.options.find((x) => x.name === o.name)!;
        optionIds.set(`${g.key}/${o.key}`, created.id);
        if (o.dailyStock !== undefined) optionStockLimit.set(created.id, o.dailyStock);
      });
      groupDefs.set(g.key, {
        id: group.id,
        name: group.name,
        required: group.required,
        minSelect: group.minSelect,
        maxSelect: group.maxSelect,
        options: group.options.map((o) => ({
          id: o.id,
          name: o.name,
          priceDelta: o.priceDelta,
          isDefault: o.isDefault,
          isActive: o.isActive,
          sortOrder: o.sortOrder,
          preferenceTagId: o.preferenceTagId,
          kcalDelta: o.kcalDelta,
          proteinDeltaG: o.proteinDeltaG,
          carbsDeltaG: o.carbsDeltaG,
          fatDeltaG: o.fatDeltaG,
          fiberDeltaG: o.fiberDeltaG,
          sugarDeltaG: o.sugarDeltaG,
          sodiumDeltaMg: o.sodiumDeltaMg,
        })),
      });
    }

    const dishes = new Map<string, DishCtx>();
    for (const [sortOrder, d] of def.dishes.entries()) {
      const nutrition: DishNutrition = {
        servingGrams: d.macros?.servingGrams ?? null,
        kcal: d.macros?.kcal ?? null,
        proteinG: d.macros?.proteinG ?? null,
        carbsG: d.macros?.carbsG ?? null,
        fatG: d.macros?.fatG ?? null,
        fiberG: d.macros?.fiberG ?? null,
        sugarG: d.macros?.sugarG ?? null,
        sodiumMg: d.macros?.sodiumMg ?? null,
      };
      const dish = await db.dish.create({
        data: {
          restaurantId: restaurant.id,
          categoryId: restaurant.categories.find((c) => c.name === d.category)?.id,
          name: d.name,
          description: d.description,
          basePrice: d.basePrice,
          allowNotes: d.allowNotes ?? false,
          sortOrder,
          ...nutrition,
          modifierGroups: { create: d.groups.map((g, i) => ({ groupId: groupIds.get(g)!, sortOrder: i })) },
          schedules: { create: d.weekdays.map((weekday) => ({ weekday, defaultStock: d.dailyStock })) },
        },
      });
      dishes.set(d.key, {
        key: d.key,
        id: dish.id,
        name: dish.name,
        basePrice: dish.basePrice,
        allowNotes: dish.allowNotes,
        nutrition,
        groups: d.groups.map((g, i) => ({ ...groupDefs.get(g)!, sortOrder: i })),
        weekdays: d.weekdays,
      });
    }

    const zones = await db.deliveryZone.findMany({ where: { restaurantId: restaurant.id } });
    out.push({
      def,
      id: restaurant.id,
      dishes,
      optionIds,
      optionStockLimit,
      deliveryFees: new Map(zones.map((z) => [z.zoneId, z.fee])),
      tiers: def.discountTiers,
      slots: new Map(),
      dishStock: new Map(),
      optionStock: new Map(),
    });
  }
  return out;
}

/** Materializa franjas y stock por fecha desde las plantillas semanales. */
async function materializeDays(r: RestaurantCtx, dates: DateKey[]) {
  const templates = await db.timeSlotTemplate.findMany({ where: { restaurantId: r.id, isActive: true } });
  for (const date of dates) {
    if (r.slots.has(date)) continue;
    const weekday = isoWeekday(date);
    const dayTemplates = templates.filter((t) => t.weekday === weekday);
    if (dayTemplates.length === 0) continue;

    await db.dailySlot.createMany({
      data: dayTemplates.map((t) => ({
        restaurantId: r.id,
        templateId: t.id,
        date: dateKeyToDb(date),
        startMinute: t.startMinute,
        endMinute: t.endMinute,
        capacity: t.capacity,
        scope: t.scope,
      })),
    });
    const slots = await db.dailySlot.findMany({ where: { restaurantId: r.id, date: dateKeyToDb(date) }, orderBy: { startMinute: "asc" } });
    r.slots.set(
      date,
      slots.map((s) => ({ id: s.id, startMinute: s.startMinute, endMinute: s.endMinute, capacity: s.capacity, scope: s.scope, used: 0 })),
    );

    const dishes = [...r.dishes.values()].filter((d) => d.weekdays.includes(weekday));
    const stockDef = new Map(r.def.dishes.map((d) => [d.key, d.dailyStock]));
    await db.dailyDishStock.createMany({
      data: dishes.map((d) => ({ restaurantId: r.id, dishId: d.id, date: dateKeyToDb(date), stock: stockDef.get(d.key)! })),
    });
    dishes.forEach((d) => r.dishStock.set(`${d.id}|${date}`, { stock: stockDef.get(d.key)!, used: 0 }));

    await db.optionDailyStock.createMany({
      data: [...r.optionStockLimit].map(([optionId, stock]) => ({ optionId, date: dateKeyToDb(date), stock })),
    });
    for (const [optionId, stock] of r.optionStockLimit) r.optionStock.set(`${optionId}|${date}`, { stock, used: 0 });
  }
}

// ---------------------------------------------------------------------------
// Selección de ítems "realista" a partir de las preferencias
// ---------------------------------------------------------------------------
function chooseItems(r: RestaurantCtx, c: CustomerCtx, date: DateKey): ItemInput[] {
  const weekday = isoWeekday(date);
  const available = [...r.dishes.values()].filter(
    (d) => d.weekdays.includes(weekday) && (r.dishStock.get(`${d.id}|${date}`)?.stock ?? 0) > 0,
  );
  const mains = available.filter((d) => d.groups.length > 0);
  const main = pick(mains.length ? mains : available);
  const items: ItemInput[] = [buildItem(main, c, chance(0.12) ? 2 : 1)];
  const sides = available.filter((d) => d.groups.length === 0 && d.id !== main.id);
  if (sides.length && chance(0.3)) items.push(buildItem(pick(sides), c, 1));
  return items;
}

function buildItem(dish: DishCtx, c: CustomerCtx, quantity: number): ItemInput {
  const selection = preloadSelection(dish.groups, { dishOptionIds: c.dishOptionIds, tagIds: c.tagIds });
  // A veces el cliente cambia algo además de lo precargado: agrega un extra.
  const extras = dish.groups.find((g) => g.name === "Extras");
  if (extras && chance(0.35)) {
    const extra = pick(extras.options);
    const inGroup = selection.filter((id) => extras.options.some((o) => o.id === id));
    if (!selection.includes(extra.id) && inGroup.length < extras.maxSelect) selection.push(extra.id);
  }
  // Grupos de selección única obligatorios sin default ni preferencia: elegir uno.
  for (const g of dish.groups) {
    const has = g.options.some((o) => selection.includes(o.id));
    if (g.required && !has) selection.push(pick(g.options).id);
  }
  return { dish, optionIds: selection, quantity, notes: dish.allowNotes && chance(0.25) ? pick(NOTES) : undefined };
}

function pickSlot(r: RestaurantCtx, date: DateKey, fulfillment: Fulfillment): SlotState | null {
  const slots = (r.slots.get(date) ?? []).filter(
    (s) => s.used < s.capacity && (s.scope === "BOTH" || s.scope === fulfillment),
  );
  return slots.length ? pick(slots) : null;
}

function chooseFulfillment(r: RestaurantCtx, c: CustomerCtx): Fulfillment {
  const canDeliver = r.def.deliveryEnabled && r.deliveryFees.has(c.zoneId);
  if (!r.def.pickupEnabled) return "DELIVERY";
  return canDeliver && chance(0.45) ? "DELIVERY" : "PICKUP";
}

/** Momento de creación verosímil: antes de la hora de corte y antes de ahora. */
function plausibleCreatedAt(r: RestaurantCtx, date: DateKey, now: Date): Date {
  const cutoff = cutoffInstant(date, r.def.cutoffDaysBefore, r.def.cutoffMinute);
  const latest = Math.min(now.getTime() - 5 * 60_000, cutoff.getTime() - 30 * 60_000);
  return new Date(latest - between(1, 96) * 3_600_000);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if ((await db.user.count()) > 0) {
    console.error("La base ya tiene datos. Corré `npm run db:reset` para empezar de cero.");
    process.exit(1);
  }

  const now = new Date();
  const today = todayKey(now);
  console.log(`Seed para hoy ${today} (America/Asuncion)`);

  // Plataforma
  await db.platformSettings.create({ data: { id: 1 } });
  await db.zone.createMany({ data: ZONES });
  await db.cuisineType.createMany({ data: CUISINES });
  await db.preferenceTag.createMany({ data: PREFERENCE_TAGS.map((t, sortOrder) => ({ ...t, sortOrder })) });
  const zoneIds = new Map((await db.zone.findMany()).map((z) => [z.slug, z.id]));
  const cuisineIds = new Map((await db.cuisineType.findMany()).map((c) => [c.slug, c.id]));
  const tagIds = new Map((await db.preferenceTag.findMany()).map((t) => [t.slug, t.id]));

  // Usuarios
  const passwordHash = await hashPassword(PASSWORD);
  await db.user.create({
    data: { name: "Administración", email: "admin@prepago.test", role: "SUPER_ADMIN", passwordHash },
  });
  const ownerIds = new Map<string, string>();
  for (const r of RESTAURANTS) {
    const owner = await db.user.create({
      data: { name: r.owner.name, email: r.owner.email, role: "RESTAURANT_ADMIN", passwordHash },
    });
    ownerIds.set(r.key, owner.id);
  }

  const restaurants = await createCatalog(ownerIds, tagIds, zoneIds, cuisineIds);
  const byKey = new Map(restaurants.map((r) => [r.def.key, r]));

  const customers: CustomerCtx[] = [];
  for (const c of CUSTOMERS) {
    const user = await db.user.create({
      data: {
        name: c.name,
        email: c.email,
        phone: c.phone,
        role: "CUSTOMER",
        passwordHash,
        customerProfile: { create: { allergens: c.allergens, allergyOther: c.allergyOther } },
        addresses: { create: { label: "Casa", street: c.street, zoneId: zoneIds.get(c.zone)!, isDefault: true } },
      },
    });
    const dishOptionIds = new Set<string>();
    for (const p of c.generalPrefs) {
      await db.customerPreference.create({ data: { userId: user.id, scope: "GENERAL", tagId: tagIds.get(p)! } });
    }
    for (const p of c.dishPrefs) {
      const r = byKey.get(p.restaurant)!;
      const optionId = r.optionIds.get(`${p.group}/${p.option}`)!;
      dishOptionIds.add(optionId);
      await db.customerPreference.create({
        data: { userId: user.id, scope: "DISH", dishId: r.dishes.get(p.dish)!.id, optionId },
      });
    }
    customers.push({
      key: c.key,
      id: user.id,
      name: c.name,
      zoneId: zoneIds.get(c.zone)!,
      address: { label: "Casa", street: c.street, zone: ZONES.find((z) => z.slug === c.zone)!.name },
      allergens: c.allergens,
      allergyOther: c.allergyOther ?? null,
      tagIds: new Set(c.generalPrefs.map((p) => tagIds.get(p)!)),
      dishOptionIds,
    });
  }
  const customer = (key: string) => customers.find((c) => c.key === key)!;

  // Días: 2 hacia atrás, hoy y 7 hacia adelante
  const window = eachDay(addDays(today, -2), addDays(today, 7));
  for (const r of restaurants) await materializeDays(r, window);

  // Pedidos sueltos
  const created: { draft: OrderDraft; orderId: string; status: OrderStatus }[] = [];
  for (const r of restaurants) {
    for (const date of window) {
      if (!r.slots.has(date)) continue;
      const n = between(5, 10);
      for (let i = 0; i < n; i++) {
        const c = pick(customers);
        const fulfillment = chooseFulfillment(r, c);
        const slot = pickSlot(r, date, fulfillment);
        if (!slot) continue;
        const draft = draftOrder({ r, customer: c, date, slot, fulfillment, items: chooseItems(r, c, date), createdAt: plausibleCreatedAt(r, date, now) });
        if (!canFit(draft)) continue;
        reserve(draft);
        const status: OrderStatus =
          date < today ? "DELIVERED" : date > today ? "CONFIRMED" : pick(["CONFIRMED", "IN_PREPARATION", "READY"] as const);
        const order = await db.$transaction(async (tx) => {
          const o = await insertOrder(tx, draft, status);
          await capturePayment(tx, {
            customerId: c.id,
            restaurantId: r.id,
            amount: o.total,
            commissionAmount: o.commissionAmount,
            orderId: o.id,
            reference: o.code,
            at: draft.createdAt,
          });
          return o;
        });
        created.push({ draft, orderId: order.id, status });
      }
    }
  }

  // --- Casos especiales -----------------------------------------------------
  const rosa = byKey.get("rosa")!;
  const fit = byKey.get("fit")!;
  const quincho = byKey.get("quincho")!;
  const futureDay = (r: RestaurantCtx, from: number) => window.find((d) => d >= addDays(today, from) && r.slots.has(d))!;

  // 1) Doña Rosa cancela un pedido de Ana → reembolso del 100% a la billetera (política por defecto).
  const ana = customer("ana");
  {
    const date = futureDay(rosa, 2);
    const draft = draftOrder({
      r: rosa,
      customer: ana,
      date,
      slot: pickSlot(rosa, date, "PICKUP")!,
      fulfillment: "PICKUP",
      items: [buildItem([...rosa.dishes.values()].find((d) => d.weekdays.includes(isoWeekday(date)) && d.groups.length > 0)!, ana, 2)],
      createdAt: plausibleCreatedAt(rosa, date, now),
    });
    await db.$transaction(async (tx) => {
      const o = await insertOrder(tx, draft, "CANCELLED_BY_RESTAURANT", { cancelReason: "Corte de luz en la cocina" });
      await capturePayment(tx, { customerId: ana.id, restaurantId: rosa.id, amount: o.total, commissionAmount: o.commissionAmount, orderId: o.id, reference: o.code, at: draft.createdAt });
      await postLedgerTransaction(tx, {
        type: "REFUND_TO_WALLET",
        description: `Cancelación del restaurante · pedido ${o.code}`,
        idempotencyKey: `order:${o.id}:restaurant-cancel`,
        orderId: o.id,
        entries: restaurantCancelEntries({
          userId: ana.id,
          restaurantId: rosa.id,
          total: o.total,
          commissionAmount: o.commissionAmount,
          refundsCommission: rosa.def.restaurantCancelRefundsCommission,
          penaltyBps: rosa.def.restaurantCancelPenaltyBps,
        }),
      });
    });
  }

  // 2) Ana usa ese saldo en Fit Bowl (pago mixto billetera + tarjeta).
  {
    const date = futureDay(fit, 1);
    const fulfillment = chooseFulfillment(fit, ana);
    const draft = draftOrder({
      r: fit,
      customer: ana,
      date,
      slot: pickSlot(fit, date, fulfillment)!,
      fulfillment,
      items: [buildItem(fit.dishes.get("bowl-salmon")!.weekdays.includes(isoWeekday(date)) ? fit.dishes.get("bowl-salmon")! : fit.dishes.get("bowl-pollo")!, ana, 1)],
      createdAt: minutes(now, -30),
    });
    reserve(draft);
    await db.$transaction(async (tx) => {
      const o = await insertOrder(tx, draft, "CONFIRMED");
      await capturePayment(tx, { customerId: ana.id, restaurantId: fit.id, amount: o.total, commissionAmount: o.commissionAmount, orderId: o.id, reference: o.code, at: draft.createdAt, useWallet: true });
    });
  }

  // 3) El Quincho cancela un pedido de Sofía → absorbe la comisión y paga 5% de penalidad.
  const sofia = customer("sofia");
  {
    const date = futureDay(quincho, 1);
    const draft = draftOrder({
      r: quincho,
      customer: sofia,
      date,
      slot: pickSlot(quincho, date, "PICKUP")!,
      fulfillment: "PICKUP",
      items: [buildItem(quincho.dishes.get("bife-chorizo")!, sofia, 1)],
      createdAt: plausibleCreatedAt(quincho, date, now),
    });
    await db.$transaction(async (tx) => {
      const o = await insertOrder(tx, draft, "CANCELLED_BY_RESTAURANT", { cancelReason: "Sin stock de bife de chorizo" });
      await capturePayment(tx, { customerId: sofia.id, restaurantId: quincho.id, amount: o.total, commissionAmount: o.commissionAmount, orderId: o.id, reference: o.code, at: draft.createdAt });
      await postLedgerTransaction(tx, {
        type: "REFUND_TO_WALLET",
        description: `Cancelación del restaurante · pedido ${o.code}`,
        idempotencyKey: `order:${o.id}:restaurant-cancel`,
        orderId: o.id,
        entries: restaurantCancelEntries({
          userId: sofia.id,
          restaurantId: quincho.id,
          total: o.total,
          commissionAmount: o.commissionAmount,
          refundsCommission: quincho.def.restaurantCancelRefundsCommission,
          penaltyBps: quincho.def.restaurantCancelPenaltyBps,
        }),
      });
    });
  }

  // 4) Juan no completó el pago a tiempo → reserva vencida (EXPIRED), no ocupa cupo.
  const juan = customer("juan");
  {
    const date = futureDay(fit, 1);
    const draft = draftOrder({
      r: fit,
      customer: juan,
      date,
      slot: pickSlot(fit, date, "PICKUP")!,
      fulfillment: "PICKUP",
      items: [buildItem(fit.dishes.get("bowl-pollo")!, juan, 1)],
      createdAt: minutes(now, -60),
    });
    await db.$transaction(async (tx) => {
      const o = await insertOrder(tx, draft, "EXPIRED");
      await tx.payment.create({
        data: {
          customerId: juan.id,
          purpose: "ORDER",
          orderId: o.id,
          amount: o.total,
          gatewayAmount: o.total,
          provider: "MOCK",
          providerRef: `mock_${o.code}`,
          status: "EXPIRED",
          idempotencyKey: `seed:${o.code}`,
          expiresAt: minutes(draft.createdAt, 10),
          createdAt: draft.createdAt,
        },
      });
    });
  }

  // 5) María cancela un pedido suelto antes del corte → 80% a la billetera (política de Fit Bowl).
  const maria = customer("maria");
  {
    const date = futureDay(fit, 2);
    const draft = draftOrder({
      r: fit,
      customer: maria,
      date,
      slot: pickSlot(fit, date, "PICKUP")!,
      fulfillment: "PICKUP",
      items: [buildItem(fit.dishes.get("wrap")!.weekdays.includes(isoWeekday(date)) ? fit.dishes.get("wrap")! : fit.dishes.get("bowl-veggie")!, maria, 1)],
      createdAt: minutes(now, -48 * 60),
    });
    await db.$transaction(async (tx) => {
      const o = await insertOrder(tx, draft, "CANCELLED_BY_CUSTOMER", { cancelReason: "Cambio de planes" });
      await capturePayment(tx, { customerId: maria.id, restaurantId: fit.id, amount: o.total, commissionAmount: o.commissionAmount, orderId: o.id, reference: o.code, at: draft.createdAt });
      await postLedgerTransaction(tx, {
        type: "REFUND_TO_WALLET",
        description: `Cancelación del cliente · pedido ${o.code}`,
        idempotencyKey: `order:${o.id}:customer-cancel`,
        orderId: o.id,
        entries: partialRefundEntries({
          userId: maria.id,
          restaurantId: fit.id,
          total: o.total,
          commissionAmount: o.commissionAmount,
          refundAmount: applyBps(o.total, fit.def.customerCancelRefundBps),
        }),
      });
    });
  }

  // --- Planes mensuales -----------------------------------------------------
  // Ana en Doña Rosa: todo el mes siguiente (lun–vie), dejando 2 días libres.
  {
    const start = nextMonthStart(today);
    const { end } = monthBounds(start);
    const days = eachDay(start, end).filter((d) => rosa.def.plan!.weekdays.includes(isoWeekday(d)));
    const chosen = days.filter((_, i) => i !== 7 && i !== 12); // días libres
    await materializeDays(rosa, chosen);
    const menuByWeekday: Record<number, string> = { 1: "milanesa", 2: "bife-koygua", 3: "pollo-horno", 4: "tallarin", 5: "pollo-horno" };
    await createPlan(rosa, ana, chosen, (date) => [buildPlanItem(rosa.dishes.get(menuByWeekday[isoWeekday(date)])!, ana)], "PICKUP", 12 * 60, minutes(now, -120));
  }

  // María en Fit Bowl: el resto de este mes (o el siguiente si quedan pocos días), con delivery.
  {
    const plan = fit.def.plan!;
    let days = eachDay(addDays(today, 2), monthBounds(today).end).filter((d) => plan.weekdays.includes(isoWeekday(d)));
    if (days.length < plan.minDays) {
      const start = nextMonthStart(today);
      days = eachDay(start, monthBounds(start).end).filter((d) => plan.weekdays.includes(isoWeekday(d)));
    }
    await materializeDays(fit, days);
    await createPlan(
      fit,
      maria,
      days,
      (date, i) => [buildPlanItem(fit.dishes.get(i % 2 === 0 ? "bowl-pollo" : "bowl-veggie")!, maria)],
      "DELIVERY",
      12 * 60 + 30,
      minutes(now, -240),
    );
  }

  // --- Reclamos de ejemplo (Fase 7) ------------------------------------------
  // Sobre pedidos ya entregados: uno abierto y otro en revisión.
  {
    const delivered = created.filter((c) => c.status === "DELIVERED");
    const samples = [
      { order: delivered.find((c) => c.draft.r === rosa), reason: "WRONG_ITEMS" as const, status: "OPEN" as const, description: "Pedí la milanesa con puré y vino con ensalada." },
      { order: delivered.find((c) => c.draft.r === quincho), reason: "LATE" as const, status: "IN_REVIEW" as const, description: "Tuve que esperar 40 minutos para retirar el pedido." },
    ];
    for (const s of samples) {
      if (!s.order) continue;
      await db.claim.create({
        data: {
          orderId: s.order.orderId,
          customerId: s.order.draft.customer.id,
          restaurantId: s.order.draft.r.id,
          reason: s.reason,
          status: s.status,
          description: s.description,
        },
      });
    }
  }

  await printSummary();
}

function buildPlanItem(dish: DishCtx, c: CustomerCtx): ItemInput {
  return { dish, optionIds: preloadSelection(dish.groups, { dishOptionIds: c.dishOptionIds, tagIds: c.tagIds }), quantity: 1 };
}

/** Plan mensual: un pago, un pedido PLAN_DAY por cada día elegido. */
async function createPlan(
  r: RestaurantCtx,
  c: CustomerCtx,
  days: DateKey[],
  itemsFor: (date: DateKey, index: number) => ItemInput[],
  fulfillment: Fulfillment,
  slotStartMinute: number,
  createdAt: Date,
) {
  const plan = r.def.plan!;
  const drafts = days.map((date, i) => {
    const slot = r.slots.get(date)!.find((s) => s.startMinute === slotStartMinute)!;
    const draft = draftOrder({ r, customer: c, date, slot, fulfillment, items: itemsFor(date, i), createdAt, planDiscountBps: plan.discountBps });
    if (!canFit(draft)) throw new Error(`Sin cupo para el plan el ${date}`);
    reserve(draft);
    return draft;
  });
  const sum = (f: (d: OrderDraft) => number) => drafts.reduce((a, d) => a + f(d), 0);

  await db.$transaction(
    async (tx) => {
      const subscription = await tx.subscription.create({
        data: {
          code: newCode(),
          customerId: c.id,
          restaurantId: r.id,
          periodStart: dateKeyToDb(days[0]),
          periodEnd: dateKeyToDb(days[days.length - 1]),
          status: "ACTIVE",
          itemsSubtotal: sum((d) => d.price.itemsSubtotal),
          discountBps: plan.discountBps,
          discountAmount: sum((d) => d.price.discountAmount),
          deliveryFee: sum((d) => d.price.deliveryFee),
          total: sum((d) => d.price.total),
          cancelDaysBefore: plan.cancelDaysBefore,
          cancelMinute: plan.cancelMinute,
          cancelRefundBps: plan.cancelRefundBps,
          allowPause: true,
          holdExpiresAt: minutes(createdAt, 10),
          confirmedAt: minutes(createdAt, 1),
          createdAt,
        },
      });
      let commission = 0;
      for (const d of drafts) {
        const o = await insertOrder(tx, d, "CONFIRMED", { subscriptionId: subscription.id });
        commission += o.commissionAmount;
      }
      await capturePayment(tx, {
        customerId: c.id,
        restaurantId: r.id,
        amount: subscription.total,
        commissionAmount: commission,
        subscriptionId: subscription.id,
        reference: subscription.code,
        at: createdAt,
      });
    },
    { timeout: 60_000 },
  );
}

async function printSummary() {
  const [users, restaurants, dishes, byStatus, subs, ledgerSum, wallets] = await Promise.all([
    db.user.groupBy({ by: ["role"], _count: { _all: true } }),
    db.restaurant.count(),
    db.dish.count(),
    db.order.groupBy({ by: ["status"], _count: { _all: true } }),
    db.subscription.findMany({ include: { customer: true, restaurant: true, _count: { select: { orders: true } } } }),
    db.ledgerEntry.aggregate({ _sum: { amount: true } }),
    db.ledgerAccount.findMany({
      where: { type: "CUSTOMER_WALLET" },
      include: { user: true, entries: { select: { amount: true } } },
    }),
  ]);
  console.log("\nUsuarios:", Object.fromEntries(users.map((u) => [u.role, u._count._all])));
  console.log(`Restaurantes: ${restaurants} · Platos: ${dishes}`);
  console.log("Pedidos por estado:", Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])));
  for (const s of subs) {
    console.log(`Plan ${s.code}: ${s.customer.name} en ${s.restaurant.name} · ${s._count.orders} días · Gs. ${s.total}`);
  }
  for (const w of wallets) {
    const balance = -w.entries.reduce((a, e) => a + e.amount, 0);
    console.log(`Billetera de ${w.user?.name}: Gs. ${balance}`);
  }
  if ((ledgerSum._sum.amount ?? 0) !== 0) throw new Error("El ledger no suma 0");
  console.log("Ledger balanceado ✔");
  console.log(`\nContraseña de todas las cuentas de prueba: ${PASSWORD}`);
  console.log("Cuentas: admin@prepago.test · rosa@ · fit@ · quincho@ · ana@ · maria@ · juan@ · sofia@ (prepago.test)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
