import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/modules/auth/session";
import { isSameOriginJson } from "@/modules/notifications/http";
import { pushUnsubscribeSchema } from "@/modules/notifications/push-schema";
import { removePushSubscription } from "@/modules/notifications/push-subscriptions";

// Borra la suscripción push de ESTE dispositivo (solo si es del usuario logueado).
export async function POST(request: NextRequest) {
  if (!isSameOriginJson(request.headers, request.url)) {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const parsed = pushUnsubscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Solicitud inválida" }, { status: 422 });

  const removed = await removePushSubscription(user.id, parsed.data.endpoint);
  return NextResponse.json({ ok: true, removed });
}
