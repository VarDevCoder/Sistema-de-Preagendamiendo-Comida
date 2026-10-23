import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { expireStaleReservations } from "@/modules/orders/expire";

// Vercel Cron: pasa a EXPIRED las reservas vencidas y sus pagos pendientes.
// Solo limpieza (la correctitud del cupo no depende de esto). Idempotente.
export async function GET(request: NextRequest) {
  if (!authorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const result = await expireStaleReservations();
  return NextResponse.json({ ok: true, ...result });
}

function authorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
