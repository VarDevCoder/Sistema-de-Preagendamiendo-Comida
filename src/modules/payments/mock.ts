import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { CreateCheckoutInput, CreateCheckoutResult, ParseWebhookResult, PaymentProvider, RemoteStatus, WebhookEventType } from "./types";
import { SIGNATURE_HEADER, signBody, verifyBodySignature } from "./signature";

// Pasarela simulada para desarrollo y tests. La "página del proveedor" es
// /pagos/mock/[paymentId]: sus botones arman un evento como lo haría la
// pasarela real, lo firman y lo envían a /api/pagos/webhook/mock.

const mockEventSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum(["payment.approved", "payment.rejected"]),
  data: z.object({
    reference: z.string().min(1).max(100),
    amount: z.number().int().nonnegative(),
    reason: z.string().max(200).optional(),
  }),
  createdAt: z.string().optional(),
});

export type MockEvent = z.infer<typeof mockEventSchema>;

export function mockProviderRef(paymentId: string): string {
  return `mock_${paymentId}`;
}

export function buildMockEvent(p: { providerRef: string; type: WebhookEventType; amount: number; reason?: string; eventId?: string }): MockEvent {
  return {
    id: p.eventId ?? `evt_${randomUUID()}`,
    type: p.type,
    data: { reference: p.providerRef, amount: p.amount, ...(p.reason ? { reason: p.reason } : {}) },
    createdAt: new Date().toISOString(),
  };
}

/** Cuerpo + headers listos para hacer el POST al webhook. */
export function signMockEvent(secret: string, event: MockEvent): { body: string; headers: Record<string, string> } {
  const body = JSON.stringify(event);
  return { body, headers: { "content-type": "application/json", [SIGNATURE_HEADER]: signBody(secret, body) } };
}

export class MockPaymentProvider implements PaymentProvider {
  readonly kind = "MOCK" as const;
  constructor(private readonly secret: string) {}

  async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    return { providerRef: mockProviderRef(input.paymentId), redirectUrl: `/pagos/mock/${input.paymentId}` };
  }

  async parseWebhook(rawBody: string, headers: Headers): Promise<ParseWebhookResult> {
    if (!verifyBodySignature(this.secret, rawBody, headers.get(SIGNATURE_HEADER))) {
      return { ok: false, status: 401, error: "Firma inválida" };
    }
    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return { ok: false, status: 400, error: "JSON inválido" };
    }
    const parsed = mockEventSchema.safeParse(json);
    if (!parsed.success) return { ok: false, status: 400, error: "Evento inválido" };
    const e = parsed.data;
    return {
      ok: true,
      event: { eventId: e.id, type: e.type, providerRef: e.data.reference, amount: e.data.amount, reason: e.data.reason, raw: e },
    };
  }

  async getStatus(): Promise<RemoteStatus> {
    // El mock no guarda estado propio: la verdad está en PaymentWebhookEvent.
    return "UNKNOWN";
  }
}
