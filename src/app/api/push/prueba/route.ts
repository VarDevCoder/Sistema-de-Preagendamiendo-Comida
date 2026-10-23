import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/modules/auth/session";
import { isSameOriginJson } from "@/modules/notifications/http";
import { sendTestPush } from "@/modules/notifications/push-subscriptions";

// Envía un push de prueba a los dispositivos del usuario logueado.
export async function POST(request: NextRequest) {
  if (!isSameOriginJson(request.headers, request.url)) {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  return NextResponse.json(await sendTestPush(user.id));
}
