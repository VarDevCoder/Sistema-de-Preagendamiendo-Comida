import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { ensureDayMaterialized } from "@/modules/availability/materialize";
import { addDays, todayKey, type DateKey } from "@/modules/shared/time";
import { accounts } from "@/modules/wallet/accounts";
import { postLedgerTransaction } from "@/modules/wallet/ledger-tx";
import { buildMockEvent } from "@/modules/payments/mock";
import type { PaymentEvent } from "@/modules/payments/types";

// Datos aislados por test: un restaurante propio (slug único) con una franja,
// un plato y una opción con stock diario configurables. No toca los datos del seed.

export type Fixture = Awaited<ReturnType<typeof createFixture>>;

export const BASE_PRICE = 40_000;
export const EXTRA_PRICE = 5_000;

export async function createFixture(opts: { slotCapacity?: number; dishStock?: number; optionStock?: number; customers?: number } = {}) {
  const tag = randomUUID().slice(0, 8);
  await db.platformSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  const zone = await db.zone.create({ data: { slug: `z-${tag}`, name: `Zona ${tag}` } });
  const weekdays = [1, 2, 3, 4, 5, 6, 7];
  const restaurant = await db.restaurant.create({
    data: {
      slug: `test-${tag}`,
      name: `Test ${tag}`,
      addressLine: "Calle 1",
      zoneId: zone.id,
      status: "ACTIVE",
      pickupEnabled: true,
      deliveryEnabled: true,
      cutoffDaysBefore: 1,
      cutoffMinute: 20 * 60,
      maxDaysAhead: 30,
      commissionBps: 1000,
      customerCancelRefundBps: 8000,
      discountTiers: { create: [{ minHoursBefore: 24, discountBps: 1000 }] },
      deliveryZones: { create: [{ zoneId: zone.id, fee: 7_000 }] },
      slotTemplates: {
        create: weekdays.map((weekday) => ({ weekday, startMinute: 12 * 60, endMinute: 12 * 60 + 30, capacity: opts.slotCapacity ?? 100, scope: "BOTH" as const })),
      },
    },
  });
  const group = await db.modifierGroup.create({
    data: {
      restaurantId: restaurant.id,
      name: "Extras",
      required: false,
      minSelect: 0,
      maxSelect: 2,
      options: {
        create: [
          { name: "Extra queso", priceDelta: EXTRA_PRICE, dailyStock: opts.optionStock ?? null, sortOrder: 0, kcalDelta: 100, proteinDeltaG: 7 },
          { name: "Huevo", priceDelta: 3_000, sortOrder: 1 },
        ],
      },
    },
    include: { options: { orderBy: { sortOrder: "asc" } } },
  });
  const dish = await db.dish.create({
    data: {
      restaurantId: restaurant.id,
      name: "Milanesa test",
      basePrice: BASE_PRICE,
      allowNotes: true,
      kcal: 700,
      proteinG: 40,
      carbsG: 50,
      fatG: 30,
      modifierGroups: { create: [{ groupId: group.id, sortOrder: 0 }] },
      schedules: { create: weekdays.map((weekday) => ({ weekday, defaultStock: opts.dishStock ?? 100 })) },
    },
  });
  const customers = await Promise.all(
    Array.from({ length: opts.customers ?? 1 }, (_, i) =>
      db.user.create({
        data: {
          email: `c${i}-${tag}@test.local`,
          name: `Cliente ${i}`,
          role: "CUSTOMER",
          customerProfile: { create: {} },
          addresses: { create: { label: "Casa", street: "Calle 2", zoneId: zone.id, isDefault: true } },
        },
        include: { addresses: true },
      }),
    ),
  );
  const date: DateKey = addDays(todayKey(), 3);
  // La franja del día (materializada por el primer checkout); acá la creamos para conocer su id.
  await db.$transaction((tx) => ensureDayMaterialized(tx, restaurant.id, date));
  const slot = await db.dailySlot.findFirstOrThrow({ where: { restaurantId: restaurant.id, startMinute: 12 * 60 } });
  return { tag, zone, restaurant, group, extra: group.options[0], huevo: group.options[1], dish, customers, date, slot };
}

export function checkoutInput(f: Fixture, over: Record<string, unknown> = {}) {
  return {
    restaurantSlug: f.restaurant.slug,
    date: f.date,
    slotId: f.slot.id,
    fulfillment: "PICKUP",
    allergens: [],
    useWallet: false,
    checkoutKey: randomUUID(),
    items: [{ dishId: f.dish.id, optionIds: [], quantity: 1 }],
    ...over,
  };
}

/** Acredita saldo a la billetera (como un reembolso por reclamo). */
export async function fundWallet(userId: string, amount: number) {
  await db.$transaction((tx) =>
    postLedgerTransaction(tx, {
      type: "CLAIM_REFUND",
      description: "Saldo de prueba",
      idempotencyKey: `test:fund:${userId}:${randomUUID()}`,
      entries: [
        { account: accounts.goodwill, amount },
        { account: accounts.wallet(userId), amount: -amount },
      ],
    }),
  );
}

export async function walletBalance(userId: string): Promise<number> {
  const acc = await db.ledgerAccount.findUnique({ where: { code: accounts.wallet(userId) } });
  if (!acc) return 0;
  const agg = await db.ledgerEntry.aggregate({ where: { accountId: acc.id }, _sum: { amount: true } });
  return 0 - (agg._sum.amount ?? 0);
}

export async function paymentOf(orderId: string) {
  return db.payment.findFirstOrThrow({ where: { orderId }, orderBy: { createdAt: "desc" } });
}

export async function approvedEvent(orderId: string, eventId?: string): Promise<PaymentEvent> {
  const p = await paymentOf(orderId);
  const raw = buildMockEvent({ providerRef: p.providerRef!, type: "payment.approved", amount: p.gatewayAmount, eventId });
  return { eventId: raw.id, type: raw.type, providerRef: raw.data.reference, amount: raw.data.amount, raw };
}

export async function rejectedEvent(orderId: string): Promise<PaymentEvent> {
  const p = await paymentOf(orderId);
  const raw = buildMockEvent({ providerRef: p.providerRef!, type: "payment.rejected", amount: p.gatewayAmount, reason: "Fondos insuficientes" });
  return { eventId: raw.id, type: raw.type, providerRef: raw.data.reference, amount: raw.data.amount, reason: raw.data.reason, raw };
}

/** Lanza todas las promesas a la vez (máxima contención). */
export function race<T>(n: number, fn: (i: number) => Promise<T>): Promise<T[]> {
  return Promise.all(Array.from({ length: n }, (_, i) => fn(i)));
}
