import { NextResponse, type NextRequest } from "next/server";
import { processPaymentEvent } from "@/modules/payments/process";
import { gatewayKindFromSlug, getPaymentProvider } from "@/modules/payments/providers";

// Webhook de las pasarelas. Verifica la firma con el proveedor y procesa el
// evento de forma idempotente (PaymentWebhookEvent único por provider+eventId):
// un evento repetido responde 200 sin efecto.
export async function POST(request: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider: slug } = await ctx.params;
  const kind = gatewayKindFromSlug(slug);
  if (!kind) return NextResponse.json({ error: "Proveedor desconocido" }, { status: 404 });

  const rawBody = await request.text();
  let parsed;
  try {
    parsed = await getPaymentProvider(kind).parseWebhook(rawBody, request.headers);
  } catch (error) {
    console.error(`Webhook ${slug}: no se pudo verificar`, error);
    return NextResponse.json({ error: "Proveedor no disponible" }, { status: 501 });
  }
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

  const result = await processPaymentEvent(kind, parsed.event);
  return NextResponse.json({ received: true, outcome: result.outcome });
}
