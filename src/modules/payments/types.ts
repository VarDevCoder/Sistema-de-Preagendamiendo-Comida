import type { PaymentProviderKind } from "@/generated/prisma/enums";

// Abstracción de pasarela de pago. Cada proveedor real (Bancard vPOS, Pagopar)
// implementa esta interfaz; en desarrollo se usa MockPaymentProvider.

export type GatewayKind = Exclude<PaymentProviderKind, "WALLET">;

export type CreateCheckoutInput = {
  paymentId: string;
  /** monto a cobrar por la pasarela (sin la parte de billetera), en PYG */
  amount: number;
  description: string;
  customerEmail: string;
  /** URL absoluta a la que vuelve el cliente al terminar */
  returnUrl: string;
};

export type CreateCheckoutResult = {
  /** id de la transacción en el proveedor (único por proveedor) */
  providerRef: string;
  /** a dónde redirigir al cliente para pagar (absoluta o relativa a la app) */
  redirectUrl: string;
};

export type WebhookEventType = "payment.approved" | "payment.rejected";

/** Evento normalizado: el resto de la app no conoce el formato de cada proveedor. */
export type PaymentEvent = {
  eventId: string;
  type: WebhookEventType;
  providerRef: string;
  /** monto informado por el proveedor (se compara con lo esperado) */
  amount?: number;
  reason?: string;
  raw: unknown;
};

export type ParseWebhookResult =
  | { ok: true; event: PaymentEvent }
  | { ok: false; status: 400 | 401; error: string };

export type RemoteStatus = "PENDING" | "APPROVED" | "REJECTED" | "UNKNOWN";

export interface PaymentProvider {
  readonly kind: GatewayKind;
  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult>;
  /** Verifica la firma y traduce el cuerpo crudo a un PaymentEvent. */
  parseWebhook(rawBody: string, headers: Headers): Promise<ParseWebhookResult>;
  /** Consulta el estado de una transacción en el proveedor (conciliación). */
  getStatus(providerRef: string): Promise<RemoteStatus>;
}

export class NotImplementedProviderError extends Error {
  constructor(provider: string) {
    super(`La pasarela ${provider} todavía no está implementada.`);
    this.name = "NotImplementedProviderError";
  }
}
