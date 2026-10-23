import { BancardProvider } from "./bancard";
import { MockPaymentProvider } from "./mock";
import { PagoparProvider } from "./pagopar";
import type { GatewayKind, PaymentProvider } from "./types";

// Selección de pasarela: PAYMENT_PROVIDER = mock | bancard | pagopar (mock por defecto).

const SLUG_TO_KIND: Record<string, GatewayKind> = { mock: "MOCK", bancard: "BANCARD", pagopar: "PAGOPAR" };

export function gatewayKindFromSlug(slug: string): GatewayKind | null {
  return SLUG_TO_KIND[slug.toLowerCase()] ?? null;
}

export function configuredGatewayKind(): GatewayKind {
  return gatewayKindFromSlug(process.env.PAYMENT_PROVIDER ?? "mock") ?? "MOCK";
}

export function webhookSecret(): string {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET ?? "";
  if (!secret && process.env.NODE_ENV === "production") throw new Error("Falta PAYMENT_WEBHOOK_SECRET");
  return secret || "dev-webhook-secret";
}

export function getPaymentProvider(kind: GatewayKind = configuredGatewayKind()): PaymentProvider {
  switch (kind) {
    case "MOCK":
      return new MockPaymentProvider(webhookSecret());
    case "BANCARD":
      return new BancardProvider();
    case "PAGOPAR":
      return new PagoparProvider();
  }
}

/** URL pública de la app (para return_url y para el webhook del mock). */
export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
