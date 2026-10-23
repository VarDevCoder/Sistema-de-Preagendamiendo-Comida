import "server-only";
import { cache } from "react";
import { revalidatePath, updateTag } from "next/cache";
import { db } from "@/lib/db";
import { requireRestaurantBySlug } from "@/modules/auth/session";

/**
 * Restaurante del panel para el render actual (deduplicado por request: el
 * layout y la página lo piden sin repetir consultas). Autoriza igual que
 * requireRestaurantBySlug: si el usuario no administra ese local, redirige.
 * En server actions usar requireRestaurantBySlug directamente.
 */
export const getPanelRestaurant = cache((slug: string) => requireRestaurantBySlug(slug));

/** Tag de caché de los datos públicos de un restaurante (menú, franjas, config). */
export function restaurantCacheTag(restaurantId: string) {
  return `restaurant:${restaurantId}`;
}

/**
 * Después de una mutación desde el panel: re-renderiza el panel de ese local
 * y expira lo que el lado público tenga cacheado del restaurante.
 * Solo en server actions.
 */
export function revalidateRestaurant(restaurant: { id: string; slug: string }) {
  revalidatePath(`/panel/${restaurant.slug}`, "layout");
  revalidatePath(`/restaurantes/${restaurant.slug}`, "layout");
  updateTag(restaurantCacheTag(restaurant.id));
}

/** Tolerancia (%) del aviso de coherencia de macros (PlatformSettings, 15 por defecto). */
export async function getMacroTolerancePct(): Promise<number> {
  const settings = await db.platformSettings.findUnique({ where: { id: 1 }, select: { macroTolerancePct: true } });
  return settings?.macroTolerancePct ?? 15;
}
