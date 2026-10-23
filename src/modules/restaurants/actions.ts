"use server";

import { db } from "@/lib/db";
import { requireRestaurantBySlug } from "@/modules/auth/session";
import { revalidateRestaurant } from "./access";
import { fieldErrorsFrom, invalid, minuteOrNull, type ActionState } from "./form";
import { MAX_TIER_ROWS, WEEKDAYS } from "./rules";
import { fulfillmentSchema, openingHoursSchema, orderingSchema, planSchema, profileSchema, tiersSchema } from "./schemas";

// Configuración del restaurante (/panel/[slug]/configuracion). Cada action
// re-autoriza con el slug: nunca se confía en ids de restaurante del cliente.
// Comisión, política de cancelación del restaurante y macrosRequired los
// define el super admin: acá no se tocan.

const SAVED = "Cambios guardados.";

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

export async function updateProfileAction(slug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { restaurant } = await requireRestaurantBySlug(slug);
  const parsed = profileSchema.safeParse(Object.fromEntries(["name", "description", "addressLine", "zoneId", "phone", "email"].map((k) => [k, str(formData, k)])));
  if (!parsed.success) return invalid(formData, fieldErrorsFrom(parsed.error));

  const zone = await db.zone.findUnique({ where: { id: parsed.data.zoneId }, select: { id: true } });
  if (!zone) return invalid(formData, { zoneId: ["Zona inválida"] });

  await db.restaurant.update({ where: { id: restaurant.id }, data: parsed.data });
  revalidateRestaurant(restaurant);
  return { ok: true, message: SAVED };
}

export async function updateFulfillmentAction(slug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { restaurant } = await requireRestaurantBySlug(slug);
  const zones = await db.zone.findMany({ select: { id: true } });
  const raw = {
    pickupEnabled: str(formData, "pickupEnabled"),
    deliveryEnabled: str(formData, "deliveryEnabled"),
    zones: zones.filter((z) => formData.get(`zone:${z.id}`)).map((z) => ({ zoneId: z.id, fee: str(formData, `fee:${z.id}`) })),
  };
  const parsed = fulfillmentSchema.safeParse(raw);
  if (!parsed.success) {
    // Los errores de cada zona se muestran al lado de su costo.
    const errors = fieldErrorsFrom(parsed.error);
    const mapped: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(errors)) {
      const m = /^zones\.(\d+)\.fee$/.exec(k);
      mapped[m ? `fee:${raw.zones[Number(m[1])].zoneId}` : k] = v;
    }
    return invalid(formData, mapped);
  }

  const { pickupEnabled, deliveryEnabled } = parsed.data;
  await db.$transaction([
    db.restaurant.update({ where: { id: restaurant.id }, data: { pickupEnabled, deliveryEnabled } }),
    db.deliveryZone.deleteMany({ where: { restaurantId: restaurant.id } }),
    db.deliveryZone.createMany({ data: parsed.data.zones.map((z) => ({ restaurantId: restaurant.id, zoneId: z.zoneId, fee: z.fee })) }),
  ]);
  revalidateRestaurant(restaurant);
  return { ok: true, message: SAVED };
}

export async function updateOpeningHoursAction(slug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { restaurant } = await requireRestaurantBySlug(slug);
  const days = WEEKDAYS.map((weekday) => ({
    weekday: String(weekday),
    open: str(formData, `open:${weekday}`),
    opensMinute: minuteOrNull(str(formData, `opens:${weekday}`)),
    closesMinute: minuteOrNull(str(formData, `closes:${weekday}`)),
  }));
  const parsed = openingHoursSchema.safeParse({ days });
  if (!parsed.success) {
    const mapped: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const index = Number(issue.path[1]);
      const key = Number.isInteger(index) ? `day:${index + 1}` : "form";
      (mapped[key] ??= []).push(issue.path[2] === "opensMinute" || issue.path[2] === "closesMinute" ? issue.message : "Horario inválido");
    }
    return invalid(formData, mapped);
  }

  const open = parsed.data.days.filter((d) => d.open);
  await db.$transaction([
    db.openingHours.deleteMany({ where: { restaurantId: restaurant.id } }),
    db.openingHours.createMany({
      data: open.map((d) => ({ restaurantId: restaurant.id, weekday: d.weekday, opensMinute: d.opensMinute!, closesMinute: d.closesMinute! })),
    }),
  ]);
  revalidateRestaurant(restaurant);
  return { ok: true, message: SAVED };
}

export async function updateOrderingAction(slug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { restaurant } = await requireRestaurantBySlug(slug);
  const parsed = orderingSchema.safeParse(
    Object.fromEntries(["cutoffDaysBefore", "cutoffMinute", "maxDaysAhead", "customerCancelRefundBps"].map((k) => [k, str(formData, k)])),
  );
  if (!parsed.success) return invalid(formData, fieldErrorsFrom(parsed.error));
  // Los pedidos ya hechos guardan su propio cutoffAt: el cambio rige para pedidos nuevos.
  await db.restaurant.update({ where: { id: restaurant.id }, data: parsed.data });
  revalidateRestaurant(restaurant);
  return { ok: true, message: SAVED };
}

export async function updateTiersAction(slug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { restaurant } = await requireRestaurantBySlug(slug);
  const rows: { index: number; minHoursBefore: string; discountBps: string }[] = [];
  for (let i = 0; i < MAX_TIER_ROWS; i++) {
    const hours = str(formData, `hours:${i}`).trim();
    const pct = str(formData, `discount:${i}`).trim();
    if (!hours && !pct) continue; // fila vacía = sin escalón
    rows.push({ index: i, minHoursBefore: hours, discountBps: pct });
  }
  const parsed = tiersSchema.safeParse({ tiers: rows.map(({ minHoursBefore, discountBps }) => ({ minHoursBefore, discountBps })) });
  if (!parsed.success) {
    const mapped: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const [, idx, field] = issue.path;
      const key =
        typeof idx === "number" ? `${field === "minHoursBefore" ? "hours" : "discount"}:${rows[idx].index}` : "tiers";
      (mapped[key] ??= []).push(issue.message);
    }
    return invalid(formData, mapped);
  }

  await db.$transaction([
    db.advanceDiscountTier.deleteMany({ where: { restaurantId: restaurant.id } }),
    db.advanceDiscountTier.createMany({ data: parsed.data.tiers.map((t) => ({ ...t, restaurantId: restaurant.id })) }),
  ]);
  revalidateRestaurant(restaurant);
  return { ok: true, message: SAVED };
}

export async function updatePlanAction(slug: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { restaurant } = await requireRestaurantBySlug(slug);
  const raw = {
    ...Object.fromEntries(
      ["enabled", "discountBps", "periodMode", "signupDeadlineDay", "minDays", "cancelDaysBefore", "cancelMinute", "cancelRefundBps", "allowPause"].map(
        (k) => [k, str(formData, k)],
      ),
    ),
    weekdays: WEEKDAYS.filter((d) => formData.get(`weekday:${d}`)),
  };
  const parsed = planSchema.safeParse(raw);
  if (!parsed.success) return invalid(formData, fieldErrorsFrom(parsed.error));

  // Los planes ya pagados guardan un snapshot de la política: el cambio rige para planes nuevos.
  const data = parsed.data;
  await db.monthlyPlanConfig.upsert({
    where: { restaurantId: restaurant.id },
    create: { restaurantId: restaurant.id, ...data },
    update: data,
  });
  revalidateRestaurant(restaurant);
  return { ok: true, message: SAVED };
}
