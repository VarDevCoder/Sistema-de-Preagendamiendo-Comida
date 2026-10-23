"use server";

import { db } from "@/lib/db";
import { requireRestaurantBySlug } from "@/modules/auth/session";
import { revalidateRestaurant } from "@/modules/restaurants/access";
import { fieldErrorsFrom, invalid, type ActionState } from "@/modules/restaurants/form";
import { WEEKDAY_LABEL, WEEKDAYS } from "@/modules/restaurants/rules";
import { dbDateToKey, todayKey } from "@/modules/shared/time";
import { dailySlotSchema, slotTemplateSchema } from "./schemas";
import { capacityError, describeSlot, findSlotOverlap, SLOT_SCOPE_LABEL } from "./slot-rules";
import { propagateSlotTemplate, slotOccupancy } from "./stock-sync";

// Franjas horarias desde el panel: plantillas semanales y franjas por fecha.

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

function overlapMessage(o: { weekday: number; startMinute: number; endMinute: number; scope: keyof typeof SLOT_SCOPE_LABEL }) {
  return `Se superpone con ${WEEKDAY_LABEL[o.weekday].toLowerCase()} ${describeSlot(o)} (${SLOT_SCOPE_LABEL[o.scope].toLowerCase()}).`;
}

/**
 * Crea una plantilla por cada día elegido, o edita una existente (un solo día).
 * Valida que no se superponga con otra franja activa de la misma modalidad.
 */
export async function saveSlotTemplateAction(slug: string, templateId: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { restaurant } = await requireRestaurantBySlug(slug);
  const parsed = slotTemplateSchema.safeParse({
    weekdays: WEEKDAYS.filter((d) => formData.get(`weekday:${d}`)),
    startMinute: str(formData, "startMinute"),
    endMinute: str(formData, "endMinute"),
    capacity: str(formData, "capacity"),
    scope: str(formData, "scope"),
    isActive: str(formData, "isActive"),
  });
  if (!parsed.success) return invalid(formData, fieldErrorsFrom(parsed.error));
  const { weekdays, ...data } = parsed.data;
  if (templateId && weekdays.length !== 1) return invalid(formData, { weekdays: ["Al editar, elegí un solo día."] });

  const existing = await db.timeSlotTemplate.findMany({ where: { restaurantId: restaurant.id } });
  const current = templateId ? existing.find((t) => t.id === templateId) : undefined;
  if (templateId && !current) return { error: "La franja no existe." };

  if (data.isActive) {
    for (const weekday of weekdays) {
      const overlap = findSlotOverlap({ ...data, weekday, id: templateId ?? undefined }, existing);
      if (overlap) return invalid(formData, { startMinute: [overlapMessage(overlap)] });
    }
  }

  if (!current) {
    await db.timeSlotTemplate.createMany({ data: weekdays.map((weekday) => ({ ...data, weekday, restaurantId: restaurant.id })) });
    revalidateRestaurant(restaurant);
    return { ok: true, message: weekdays.length > 1 ? `${weekdays.length} franjas creadas.` : "Franja creada." };
  }

  const next = { ...data, weekday: weekdays[0] };
  const structural =
    current.weekday !== next.weekday ||
    current.startMinute !== next.startMinute ||
    current.endMinute !== next.endMinute ||
    current.scope !== next.scope ||
    (current.isActive && !next.isActive);
  const result = await db.$transaction(async (tx) => {
    await tx.timeSlotTemplate.update({ where: { id: current.id }, data: next });
    return propagateSlotTemplate(tx, {
      templateId: current.id,
      today: todayKey(),
      previousCapacity: current.capacity,
      capacity: next.capacity,
      structural,
    });
  });
  revalidateRestaurant(restaurant);
  const touched = result.updated + result.removed;
  return { ok: true, message: touched ? `Franja guardada. Se actualizaron ${touched} día(s) ya cargado(s).` : "Franja guardada." };
}

/** Activa/desactiva una plantilla desde el listado. */
export async function setSlotTemplateActiveAction(slug: string, templateId: string, isActive: boolean): Promise<ActionState> {
  const { restaurant } = await requireRestaurantBySlug(slug);
  const existing = await db.timeSlotTemplate.findMany({ where: { restaurantId: restaurant.id } });
  const current = existing.find((t) => t.id === templateId);
  if (!current) return { error: "La franja no existe." };
  if (isActive) {
    const overlap = findSlotOverlap({ ...current, isActive: true }, existing);
    if (overlap) return { error: overlapMessage(overlap) };
  }
  await db.$transaction(async (tx) => {
    await tx.timeSlotTemplate.update({ where: { id: templateId }, data: { isActive } });
    if (!isActive) {
      await propagateSlotTemplate(tx, { templateId, today: todayKey(), previousCapacity: current.capacity, capacity: current.capacity, structural: true });
    }
  });
  revalidateRestaurant(restaurant);
  return { ok: true };
}

/** Borra la plantilla. Las franjas futuras sin pedidos se van; las que tienen pedidos quedan. */
export async function deleteSlotTemplateAction(slug: string, templateId: string): Promise<ActionState> {
  const { restaurant } = await requireRestaurantBySlug(slug);
  const current = await db.timeSlotTemplate.findFirst({ where: { id: templateId, restaurantId: restaurant.id } });
  if (!current) return { error: "La franja no existe." };
  await db.$transaction(async (tx) => {
    await propagateSlotTemplate(tx, { templateId, today: todayKey(), previousCapacity: current.capacity, capacity: current.capacity, structural: true });
    await tx.timeSlotTemplate.delete({ where: { id: templateId } });
  });
  revalidateRestaurant(restaurant);
  return { ok: true, message: "Franja eliminada." };
}

/** Cupo y cierre manual de una franja en una fecha (con la fila bloqueada). */
export async function updateDailySlotAction(slug: string, slotId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { restaurant } = await requireRestaurantBySlug(slug);
  const parsed = dailySlotSchema.safeParse({ capacity: str(formData, "capacity"), isClosed: str(formData, "isClosed") });
  if (!parsed.success) return invalid(formData, fieldErrorsFrom(parsed.error));

  const result = await db.$transaction(async (tx) => {
    const [slot] = await tx.$queryRaw<{ id: string; date: Date }[]>`
      SELECT "id", "date" FROM "DailySlot" WHERE "id" = ${slotId} AND "restaurantId" = ${restaurant.id} FOR UPDATE`;
    if (!slot) return { error: "La franja no existe." } as const;
    if (dbDateToKey(slot.date) < todayKey()) return { error: "Ese día ya pasó: no se puede editar." } as const;
    const occupied = (await slotOccupancy(tx, [slot.id])).get(slot.id)?.held ?? 0;
    const error = capacityError(parsed.data.capacity, occupied);
    if (error) return { fieldError: error } as const;
    await tx.dailySlot.update({ where: { id: slot.id }, data: parsed.data });
    return { ok: true } as const;
  });
  if ("error" in result) return { error: result.error };
  if ("fieldError" in result) return invalid(formData, { capacity: [result.fieldError!] }, result.fieldError);
  revalidateRestaurant(restaurant);
  return { ok: true, message: "Guardado." };
}
