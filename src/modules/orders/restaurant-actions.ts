"use server";

import { refresh } from "next/cache";
import { requireRestaurantBySlug } from "@/modules/auth/session";
import { formatGs } from "@/modules/shared/money";
import { advanceOrderStatus, cancelOrderByRestaurant } from "./restaurant-commands";
import { advanceSchema, cancelSchema } from "./restaurant-schemas";

export type OrderActionState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

// Cada acción vuelve a autorizar: el slug viene del formulario y se verifica
// que el usuario administre ESE restaurante (y el pedido se busca dentro de él).

export async function advanceOrderAction(_prev: OrderActionState, formData: FormData): Promise<OrderActionState> {
  const parsed = advanceSchema.safeParse({
    slug: formData.get("slug"),
    orderId: formData.get("orderId"),
    to: formData.get("to"),
  });
  if (!parsed.success) return { error: "Datos inválidos." };
  const { user, restaurant } = await requireRestaurantBySlug(parsed.data.slug);
  const result = await advanceOrderStatus({
    restaurantId: restaurant.id,
    orderId: parsed.data.orderId,
    to: parsed.data.to,
    actorId: user.id,
  });
  if (!result.ok) return { error: result.error };
  refresh();
  return { ok: true };
}

export async function cancelOrderAction(_prev: OrderActionState, formData: FormData): Promise<OrderActionState> {
  const parsed = cancelSchema.safeParse({
    slug: formData.get("slug"),
    orderId: formData.get("orderId"),
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) (fieldErrors[String(issue.path[0])] ??= []).push(issue.message);
    return { fieldErrors };
  }
  const { user, restaurant } = await requireRestaurantBySlug(parsed.data.slug);
  const result = await cancelOrderByRestaurant({
    restaurantId: restaurant.id,
    orderId: parsed.data.orderId,
    reason: parsed.data.reason,
    actorId: user.id,
  });
  if (!result.ok) return { error: result.error };
  refresh();
  return {
    ok: true,
    message: result.noop
      ? "El pedido ya estaba cancelado."
      : `Pedido cancelado. Se acreditaron ${formatGs(result.refunded ?? 0)} en la billetera del cliente.`,
  };
}
