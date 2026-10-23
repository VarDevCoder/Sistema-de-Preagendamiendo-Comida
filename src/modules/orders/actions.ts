"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/modules/auth/session";
import { cancelOrderByCustomer } from "./cancel";
import { placeOrder } from "./checkout";

export type CheckoutState = { error?: string; fieldErrors?: Record<string, string[]> };

/**
 * Confirmar pedido. El formulario manda un JSON con ids y cantidades
 * (`payload`); todo lo demás lo recalcula placeOrder en el servidor.
 */
export async function placeOrderAction(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const user = await getSessionUser();
  if (!user) return { error: "Tu sesión venció. Ingresá de nuevo para pedir." };
  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "No pudimos leer el pedido. Recargá la página." };
  }
  const result = await placeOrder(user.id, payload);
  if (!result.ok) return { error: result.error, fieldErrors: result.fieldErrors };
  redirect(result.redirectUrl);
}

export type CancelState = { ok?: boolean; message?: string; error?: string };

export async function cancelOrderAction(_prev: CancelState, formData: FormData): Promise<CancelState> {
  const user = await getSessionUser();
  if (!user) return { error: "Tu sesión venció. Ingresá de nuevo." };
  const code = String(formData.get("code") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const result = await cancelOrderByCustomer(user.id, code, reason);
  if (!result.ok) return { error: result.error };
  refresh();
  return { ok: true, message: result.message };
}
