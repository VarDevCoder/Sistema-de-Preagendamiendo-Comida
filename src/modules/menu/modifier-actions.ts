"use server";

import { db } from "@/lib/db";
import { requireRestaurantBySlug } from "@/modules/auth/session";
import { propagateOptionDailyStock } from "@/modules/availability/stock-sync";
import { revalidateRestaurant } from "@/modules/restaurants/access";
import { fieldErrorsFrom, invalid, type ActionState } from "@/modules/restaurants/form";
import { todayKey } from "@/modules/shared/time";
import { defaultsError } from "./menu-rules";
import { groupSchema, optionSchema } from "./schemas";

// Grupos y opciones de modificadores desde el panel. Borrado = soft delete
// (los pedidos guardan snapshot y siguen referenciando la opción).

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

const OPTION_FIELDS = [
  "name",
  "priceDelta",
  "isDefault",
  "isActive",
  "sortOrder",
  "dailyStock",
  "preferenceTagId",
  "kcalDelta",
  "proteinDeltaG",
  "carbsDeltaG",
  "fatDeltaG",
  "fiberDeltaG",
  "sugarDeltaG",
  "sodiumDeltaMg",
] as const;

function ownedGroup(restaurantId: string, groupId: string) {
  return db.modifierGroup.findFirst({ where: { id: groupId, restaurantId, deletedAt: null } });
}

export async function saveGroupAction(slug: string, groupId: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { restaurant } = await requireRestaurantBySlug(slug);
  const parsed = groupSchema.safeParse(Object.fromEntries(["name", "description", "required", "minSelect", "maxSelect"].map((k) => [k, str(formData, k)])));
  if (!parsed.success) return invalid(formData, fieldErrorsFrom(parsed.error));

  if (groupId) {
    const group = await ownedGroup(restaurant.id, groupId);
    if (!group) return { error: "El grupo no existe." };
    const defaults = await db.modifierOption.count({ where: { groupId, isDefault: true, deletedAt: null } });
    const error = defaultsError(defaults, parsed.data.maxSelect);
    if (error) return invalid(formData, { maxSelect: [`Hay ${defaults} opciones por defecto: desmarcá alguna o subí el máximo.`] });
    await db.modifierGroup.update({ where: { id: groupId }, data: parsed.data });
  } else {
    await db.modifierGroup.create({ data: { ...parsed.data, restaurantId: restaurant.id } });
  }
  revalidateRestaurant(restaurant);
  return { ok: true, message: groupId ? "Grupo guardado." : "Grupo creado." };
}

/** Soft delete del grupo y de sus opciones; se quita de los platos que lo usaban. */
export async function deleteGroupAction(slug: string, groupId: string): Promise<ActionState> {
  const { restaurant } = await requireRestaurantBySlug(slug);
  const group = await ownedGroup(restaurant.id, groupId);
  if (!group) return { error: "El grupo no existe." };
  const now = new Date();
  await db.$transaction([
    db.modifierGroup.update({ where: { id: groupId }, data: { deletedAt: now } }),
    db.modifierOption.updateMany({ where: { groupId, deletedAt: null }, data: { deletedAt: now } }),
    db.dishModifierGroup.deleteMany({ where: { groupId } }),
  ]);
  revalidateRestaurant(restaurant);
  return { ok: true, message: "Grupo eliminado." };
}

export async function saveOptionAction(
  slug: string,
  groupId: string,
  optionId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { restaurant } = await requireRestaurantBySlug(slug);
  const group = await ownedGroup(restaurant.id, groupId);
  if (!group) return { error: "El grupo no existe." };
  const parsed = optionSchema.safeParse(Object.fromEntries(OPTION_FIELDS.map((k) => [k, str(formData, k)])));
  if (!parsed.success) return invalid(formData, fieldErrorsFrom(parsed.error));
  const data = parsed.data;

  if (data.preferenceTagId) {
    const tag = await db.preferenceTag.findUnique({ where: { id: data.preferenceTagId }, select: { id: true } });
    if (!tag) return invalid(formData, { preferenceTagId: ["Etiqueta inválida"] });
  }
  if (data.isDefault) {
    const others = await db.modifierOption.count({
      where: { groupId, isDefault: true, deletedAt: null, ...(optionId ? { id: { not: optionId } } : {}) },
    });
    const error = defaultsError(others + 1, group.maxSelect);
    if (error) return invalid(formData, { isDefault: [error] });
  }

  if (optionId) {
    const existing = await db.modifierOption.findFirst({ where: { id: optionId, groupId, deletedAt: null }, select: { dailyStock: true } });
    if (!existing) return { error: "La opción no existe." };
    await db.$transaction(async (tx) => {
      await tx.modifierOption.update({ where: { id: optionId }, data });
      // El stock por día ya materializado sigue al nuevo valor (solo días futuros sin pedidos y sin edición manual).
      await propagateOptionDailyStock(tx, { optionId, from: existing.dailyStock, to: data.dailyStock, today: todayKey() });
    });
  } else {
    await db.modifierOption.create({ data: { ...data, groupId } });
  }
  revalidateRestaurant(restaurant);
  return { ok: true, message: optionId ? "Opción guardada." : "Opción agregada." };
}

/** "Desactivar hoy": apaga/prende la opción sin borrarla (ej. "sin queso hoy"). */
export async function setOptionActiveAction(slug: string, optionId: string, isActive: boolean): Promise<ActionState> {
  const { restaurant } = await requireRestaurantBySlug(slug);
  const { count } = await db.modifierOption.updateMany({
    where: { id: optionId, deletedAt: null, group: { restaurantId: restaurant.id, deletedAt: null } },
    data: { isActive },
  });
  if (count === 0) return { error: "La opción no existe." };
  revalidateRestaurant(restaurant);
  return { ok: true };
}

export async function deleteOptionAction(slug: string, optionId: string): Promise<ActionState> {
  const { restaurant } = await requireRestaurantBySlug(slug);
  const { count } = await db.modifierOption.updateMany({
    where: { id: optionId, deletedAt: null, group: { restaurantId: restaurant.id } },
    data: { deletedAt: new Date(), isDefault: false },
  });
  if (count === 0) return { error: "La opción no existe." };
  revalidateRestaurant(restaurant);
  return { ok: true, message: "Opción eliminada." };
}
