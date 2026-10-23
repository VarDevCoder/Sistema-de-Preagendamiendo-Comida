import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/modules/auth/session";
import { vapidPublicKey } from "@/modules/notifications/config";
import { isSameOriginJson } from "@/modules/notifications/http";
import { pushSubscriptionSchema } from "@/modules/notifications/push-schema";
import { savePushSubscription } from "@/modules/notifications/push-subscriptions";

// Guarda la suscripción web push del dispositivo para el usuario logueado.
export async function POST(request: NextRequest) {
  if (!isSameOriginJson(request.headers, request.url)) {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Iniciá sesión para activar las notificaciones" }, { status: 401 });
  if (!vapidPublicKey()) {
    return NextResponse.json({ error: "Las notificaciones push no están habilitadas" }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const parsed = pushSubscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Suscripción inválida", issues: parsed.error.issues.length }, { status: 422 });
  }

  await savePushSubscription(user.id, parsed.data, request.headers.get("user-agent"));
  return NextResponse.json({ ok: true });
}
