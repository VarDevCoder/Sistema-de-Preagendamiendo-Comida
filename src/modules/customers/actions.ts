"use server";

import { refresh } from "next/cache";
import { db } from "@/lib/db";
import { getSessionUser } from "@/modules/auth/session";
import { fieldErrorsOf } from "@/modules/orders/schemas";
import { addressSchema, allergiesSchema, dishPreferenceSchema } from "./schemas";

// Acciones del perfil del cliente. Cada una vuelve a autorizar con la sesión.

export type ActionState = { ok?: boolean; message?: string; error?: string; fieldErrors?: Record<string, string[]> };

async function customer() {
  const user = await getSessionUser();
  return user && user.role === "CUSTOMER" ? user : null;
}

const NO_SESSION: ActionState = { error: "Ingresá con tu cuenta de cliente." };

export async function saveAllergiesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await customer();
  if (!user) return NO_SESSION;
  const parsed = allergiesSchema.safeParse({
    allergens: formData.getAll("allergens").map(String),
    allergyOther: String(formData.get("allergyOther") ?? ""),
  });
  if (!parsed.success) return { error: "Revisá las alergias.", fieldErrors: fieldErrorsOf(parsed.error) };
  await db.customerProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...parsed.data },
    update: parsed.data,
  });
  refresh();
  return { ok: true, message: "Alergias guardadas. Se precargan en cada pedido." };
}

export async function addAddressAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await customer();
  if (!user) return NO_SESSION;
  const parsed = addressSchema.safeParse({
    label: String(formData.get("label") ?? ""),
    street: String(formData.get("street") ?? ""),
    reference: String(formData.get("reference") ?? ""),
    zoneId: String(formData.get("zoneId") ?? ""),
    isDefault: formData.get("isDefault") === "on" || formData.get("isDefault") === "true",
  });
  if (!parsed.success) return { error: "Revisá los datos de la dirección.", fieldErrors: fieldErrorsOf(parsed.error) };
  const zone = await db.zone.findUnique({ where: { id: parsed.data.zoneId }, select: { id: true } });
  if (!zone) return { fieldErrors: { zoneId: ["Elegí un barrio de la lista"] } };
  await db.$transaction(async (tx) => {
    const count = await tx.customerAddress.count({ where: { userId: user.id } });
    const isDefault = parsed.data.isDefault || count === 0;
    if (isDefault) await tx.customerAddress.updateMany({ where: { userId: user.id }, data: { isDefault: false } });
    await tx.customerAddress.create({ data: { ...parsed.data, isDefault, userId: user.id } });
  });
  refresh();
  return { ok: true, message: "Dirección guardada." };
}

export async function deleteAddressAction(addressId: string): Promise<ActionState> {
  const user = await customer();
  if (!user) return NO_SESSION;
  // Los pedidos guardan una copia de la dirección: borrarla no los afecta.
  const deleted = await db.customerAddress.deleteMany({ where: { id: String(addressId), userId: user.id } });
  if (deleted.count === 0) return { error: "No encontramos esa dirección." };
  refresh();
  return { ok: true };
}

export async function setDefaultAddressAction(addressId: string): Promise<ActionState> {
  const user = await customer();
  if (!user) return NO_SESSION;
  const found = await db.customerAddress.findFirst({ where: { id: String(addressId), userId: user.id }, select: { id: true } });
  if (!found) return { error: "No encontramos esa dirección." };
  await db.$transaction([
    db.customerAddress.updateMany({ where: { userId: user.id }, data: { isDefault: false } }),
    db.customerAddress.update({ where: { id: found.id }, data: { isDefault: true } }),
  ]);
  refresh();
  return { ok: true };
}

export async function toggleGeneralPreferenceAction(tagId: string, enabled: boolean): Promise<ActionState> {
  const user = await customer();
  if (!user) return NO_SESSION;
  const tag = await db.preferenceTag.findUnique({ where: { id: String(tagId) }, select: { id: true } });
  if (!tag) return { error: "Preferencia desconocida." };
  if (enabled) {
    await db.customerPreference.createMany({ data: [{ userId: user.id, scope: "GENERAL", tagId: tag.id }], skipDuplicates: true });
  } else {
    await db.customerPreference.deleteMany({ where: { userId: user.id, scope: "GENERAL", tagId: tag.id } });
  }
  refresh();
  return { ok: true };
}

export async function deleteDishPreferencesAction(dishId: string): Promise<ActionState> {
  const user = await customer();
  if (!user) return NO_SESSION;
  await db.customerPreference.deleteMany({ where: { userId: user.id, scope: "DISH", dishId: String(dishId) } });
  refresh();
  return { ok: true };
}

/**
 * "Guardar como preferencia para este plato": reemplaza las preferencias del
 * cliente para ese plato por las opciones elegidas (solo opciones vigentes del plato).
 */
export async function saveDishPreferenceAction(input: { dishId: string; optionIds: string[] }): Promise<ActionState> {
  const user = await customer();
  if (!user) return NO_SESSION;
  const parsed = dishPreferenceSchema.safeParse(input);
  if (!parsed.success) return { error: "Datos inválidos." };
  const dish = await db.dish.findFirst({
    where: { id: parsed.data.dishId, deletedAt: null },
    select: { id: true, modifierGroups: { where: { group: { deletedAt: null } }, select: { group: { select: { options: { where: { deletedAt: null }, select: { id: true } } } } } } },
  });
  if (!dish) return { error: "Ese plato ya no existe." };
  const valid = new Set(dish.modifierGroups.flatMap((g) => g.group.options.map((o) => o.id)));
  const optionIds = [...new Set(parsed.data.optionIds)].filter((id) => valid.has(id));
  await db.$transaction([
    db.customerPreference.deleteMany({ where: { userId: user.id, scope: "DISH", dishId: dish.id } }),
    db.customerPreference.createMany({ data: optionIds.map((optionId) => ({ userId: user.id, scope: "DISH" as const, dishId: dish.id, optionId })) }),
  ]);
  return { ok: true, message: "Guardamos tu preferencia para este plato." };
}
