"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUser } from "@/modules/auth/session";
import { resultPath } from "@/modules/orders/checkout";
import { buildMockEvent, signMockEvent } from "./mock";
import { appUrl, webhookSecret } from "./providers";

export type MockGatewayState = { error?: string };

/**
 * Botones de la pasarela simulada: arma el evento como lo haría la pasarela,
 * lo firma y lo envía al webhook real (/api/pagos/webhook/mock).
 */
export async function mockGatewayAction(paymentId: string, decision: "approve" | "reject", _prev: MockGatewayState): Promise<MockGatewayState> {
  const user = await getSessionUser();
  if (!user) return { error: "Tu sesión venció. Ingresá de nuevo." };
  const payment = await db.payment.findUnique({
    where: { id: String(paymentId) },
    select: { customerId: true, provider: true, providerRef: true, gatewayAmount: true, order: { select: { code: true } } },
  });
  if (!payment || payment.customerId !== user.id || payment.provider !== "MOCK" || !payment.providerRef) {
    return { error: "No encontramos ese pago." };
  }
  const event = buildMockEvent({
    providerRef: payment.providerRef,
    type: decision === "approve" ? "payment.approved" : "payment.rejected",
    amount: payment.gatewayAmount,
    reason: decision === "reject" ? "Tarjeta rechazada por el banco emisor (simulado)" : undefined,
  });
  const { body, headers: signed } = signMockEvent(webhookSecret(), event);
  try {
    const res = await fetch(`${await baseUrl()}/api/pagos/webhook/mock`, { method: "POST", body, headers: signed, cache: "no-store" });
    if (!res.ok) return { error: `La pasarela no pudo notificar el pago (HTTP ${res.status}). Probá de nuevo.` };
  } catch (error) {
    console.error("Webhook mock falló", error);
    return { error: "La pasarela no pudo notificar el pago. Probá de nuevo." };
  }
  redirect(payment.order ? resultPath(payment.order.code) : "/cuenta/pedidos");
}

/** Origen de la request actual (sirve detrás de proxies); si no, NEXT_PUBLIC_APP_URL. */
async function baseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return appUrl();
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}
