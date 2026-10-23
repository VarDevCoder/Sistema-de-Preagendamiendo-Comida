import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/modules/notifications/http";
import { sendOrderReminders } from "@/modules/notifications/reminders-job";

// Vercel Cron: todos los días 21:00 UTC (18:00 en Asunción), ver vercel.json.
// Recuerda los pedidos CONFIRMED de mañana. Idempotente (dedupeKey por pedido y canal).
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const report = await sendOrderReminders();
  console.info("[cron/recordatorios]", JSON.stringify(report));
  return NextResponse.json(report);
}
