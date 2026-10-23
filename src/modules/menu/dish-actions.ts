"use server";

import { redirect } from "next/navigation";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { requireRestaurantBySlug } from "@/modules/auth/session";
import { getMacroTolerancePct, revalidateRestaurant } from "@/modules/restaurants/access";
import { fieldErrorsFrom, invalid, type ActionState } from "@/modules/restaurants/form";
import { dateKeyToDb, todayKey } from "@/modules/shared/time";
import { macroWarning, publishBlockReason } from "./menu-rules";
import { categorySchema, dishGroupSchema, dishSchema } from "./schemas";

// Menú desde el panel: categorías, platos (con macros y foto) y la asignación
// de grupos de modificadores a cada plato. Cada action re-autoriza por slug y
// verifica que los ids pertenezcan a ESE restaurante.

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v : "";
};

const DISH_FIELDS = [
  "name",
  "description",
  "categoryId",
  "photoUrl",
  "basePrice",
  "isActive",
  "allowNotes",
  "sortOrder",
  "servingGrams",
  "kcal",
  "proteinG",
  "carbsG",
  "fatG",
  "fiberG",
  "sugarG",
  "sodiumMg",
] as const;

// ---------------------------------------------------------------------------
// Categorías
// ---------------------------------------------------------------------------

export async function saveCategoryAction(
  slug: string,
  categoryId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { restaurant } = await requireRestaurantBySlug(slug);
  const parsed = categorySchema.safeParse({ name: str(formData, "name"), sortOrder: str(formData, "sortOrder") });
  if (!parsed.success) return invalid(formData, fieldErrorsFrom(parsed.error));

  if (categoryId) {
    const { count } = await db.menuCategory.updateMany({ where: { id: categoryId, restaurantId: restaurant.id }, data: parsed.data });
    if (count === 0) return { error: "La categoría no existe." };
  } else {
    await db.menuCategory.create({ data: { ...parsed.data, restaurantId: restaurant.id } });
  }
  revalidateRestaurant(restaurant);
  return { ok: true, message: categoryId ? "Categoría guardada." : "Categoría creada." };
}

/** Borra la categoría; sus platos quedan "Sin categoría" (no se pierde nada con historia). */
export async function deleteCategoryAction(slug: string, categoryId: string): Promise<ActionState> {
  const { restaurant } = await requireRestaurantBySlug(slug);
  const { count } = await db.menuCategory.deleteMany({ where: { id: categoryId, restaurantId: restaurant.id } });
  if (count === 0) return { error: "La categoría no existe." };
  revalidateRestaurant(restaurant);
  return { ok: true, message: "Categoría eliminada." };
}

// ---------------------------------------------------------------------------
// Platos
// ---------------------------------------------------------------------------

export async function saveDishAction(slug: string, dishId: string | null, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { restaurant } = await requireRestaurantBySlug(slug);
  const parsed = dishSchema.safeParse(Object.fromEntries(DISH_FIELDS.map((k) => [k, str(formData, k)])));
  if (!parsed.success) return invalid(formData, fieldErrorsFrom(parsed.error));
  const data = parsed.data;

  // macrosRequired lo define el super admin: sin macros completos solo se guarda inactivo.
  const blocked = publishBlockReason(data, restaurant.macrosRequired);
  if (blocked) return invalid(formData, { isActive: [blocked] }, blocked);

  if (data.categoryId) {
    const category = await db.menuCategory.findFirst({ where: { id: data.categoryId, restaurantId: restaurant.id }, select: { id: true } });
    if (!category) return invalid(formData, { categoryId: ["Categoría inválida"] });
  }

  let id = dishId;
  if (dishId) {
    const { count } = await db.dish.updateMany({ where: { id: dishId, restaurantId: restaurant.id, deletedAt: null }, data });
    if (count === 0) return { error: "El plato no existe o fue eliminado." };
  } else {
    id = (await db.dish.create({ data: { ...data, restaurantId: restaurant.id }, select: { id: true } })).id;
  }

  revalidateRestaurant(restaurant);
  const warning = macroWarning(data, await getMacroTolerancePct()) ?? undefined;
  // Al crear, se pasa a la edición del plato para asignarle modificadores.
  if (!dishId) redirect(`/panel/${restaurant.slug}/menu/${id}?creado=1`);
  return { ok: true, message: "Plato guardado.", warning };
}

/** Publicar/despublicar desde el listado (mismas reglas que el formulario). */
export async function setDishActiveAction(slug: string, dishId: string, isActive: boolean): Promise<ActionState> {
  const { restaurant } = await requireRestaurantBySlug(slug);
  const dish = await db.dish.findFirst({
    where: { id: dishId, restaurantId: restaurant.id, deletedAt: null },
    select: { kcal: true, proteinG: true, carbsG: true, fatG: true },
  });
  if (!dish) return { error: "El plato no existe." };
  const blocked = publishBlockReason({ ...dish, isActive }, restaurant.macrosRequired);
  if (blocked) return { error: blocked };
  await db.dish.update({ where: { id: dishId }, data: { isActive } });
  revalidateRestaurant(restaurant);
  return { ok: true, message: isActive ? "Plato publicado." : "Plato oculto." };
}

/**
 * Soft delete: los pedidos hechos guardan su snapshot y siguen apuntando al plato.
 * Se cierran sus filas de stock desde hoy para que no se pueda pedir más.
 */
export async function deleteDishAction(slug: string, dishId: string): Promise<ActionState> {
  const { restaurant } = await requireRestaurantBySlug(slug);
  const dish = await db.dish.findFirst({ where: { id: dishId, restaurantId: restaurant.id, deletedAt: null }, select: { id: true } });
  if (!dish) return { error: "El plato no existe." };
  await db.$transaction([
    db.dish.update({ where: { id: dishId }, data: { deletedAt: new Date(), isActive: false } }),
    db.dailyDishStock.updateMany({ where: { dishId, date: { gte: dateKeyToDb(todayKey()) } }, data: { isClosed: true } }),
    db.dishSchedule.deleteMany({ where: { dishId } }),
    db.dishModifierGroup.deleteMany({ where: { dishId } }),
  ]);
  revalidateRestaurant(restaurant);
  redirect(`/panel/${restaurant.slug}/menu?eliminado=1`);
}

/**
 * Sube una foto a Vercel Blob (solo si hay BLOB_READ_WRITE_TOKEN). El navegador
 * la achica antes de mandarla, así entra en el límite de 1 MB de las actions.
 */
export async function uploadDishPhotoAction(slug: string, formData: FormData): Promise<{ url?: string; error?: string }> {
  const { restaurant } = await requireRestaurantBySlug(slug);
  if (!process.env.BLOB_READ_WRITE_TOKEN) return { error: "La subida de fotos no está configurada: pegá la URL de la foto." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Elegí una foto." };
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return { error: "La foto tiene que ser JPG, PNG o WebP." };
  if (file.size > 950_000) return { error: "La foto es muy pesada (máx. 1 MB)." };
  try {
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const blob = await put(`platos/${restaurant.id}/foto.${ext}`, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: file.type,
    });
    return { url: blob.url };
  } catch {
    return { error: "No pudimos subir la foto. Probá de nuevo o pegá una URL." };
  }
}

// ---------------------------------------------------------------------------
// Grupos de modificadores asignados a un plato (orden por plato)
// ---------------------------------------------------------------------------

async function ownedDish(restaurantId: string, dishId: string) {
  return db.dish.findFirst({ where: { id: dishId, restaurantId, deletedAt: null }, select: { id: true } });
}

export async function assignGroupAction(slug: string, dishId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { restaurant } = await requireRestaurantBySlug(slug);
  const parsed = dishGroupSchema.safeParse({ groupId: str(formData, "groupId") });
  if (!parsed.success) return invalid(formData, fieldErrorsFrom(parsed.error));
  const [dish, group] = await Promise.all([
    ownedDish(restaurant.id, dishId),
    db.modifierGroup.findFirst({ where: { id: parsed.data.groupId, restaurantId: restaurant.id, deletedAt: null }, select: { id: true } }),
  ]);
  if (!dish) return { error: "El plato no existe." };
  if (!group) return invalid(formData, { groupId: ["Grupo inválido"] });

  const existing = await db.dishModifierGroup.findMany({ where: { dishId }, select: { groupId: true, sortOrder: true } });
  if (existing.some((e) => e.groupId === group.id)) return invalid(formData, { groupId: ["Ese grupo ya está en el plato."] });
  const sortOrder = existing.reduce((max, e) => Math.max(max, e.sortOrder + 1), 0);
  await db.dishModifierGroup.create({ data: { dishId, groupId: group.id, sortOrder } });
  revalidateRestaurant(restaurant);
  return { ok: true, message: "Grupo agregado." };
}

export async function unassignGroupAction(slug: string, dishId: string, groupId: string): Promise<ActionState> {
  const { restaurant } = await requireRestaurantBySlug(slug);
  if (!(await ownedDish(restaurant.id, dishId))) return { error: "El plato no existe." };
  await db.dishModifierGroup.deleteMany({ where: { dishId, groupId } });
  revalidateRestaurant(restaurant);
  return { ok: true };
}

/** Sube o baja un grupo en el orden de ESE plato (renumera 0..n-1). */
export async function moveGroupAction(slug: string, dishId: string, groupId: string, direction: "up" | "down"): Promise<ActionState> {
  const { restaurant } = await requireRestaurantBySlug(slug);
  if (!(await ownedDish(restaurant.id, dishId))) return { error: "El plato no existe." };
  const rows = await db.dishModifierGroup.findMany({
    where: { dishId, group: { deletedAt: null } },
    orderBy: [{ sortOrder: "asc" }, { groupId: "asc" }],
    select: { groupId: true },
  });
  const ids = rows.map((r) => r.groupId);
  const i = ids.indexOf(groupId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return { ok: true };
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await db.$transaction(ids.map((gid, sortOrder) => db.dishModifierGroup.update({ where: { dishId_groupId: { dishId, groupId: gid } }, data: { sortOrder } })));
  revalidateRestaurant(restaurant);
  return { ok: true };
}
