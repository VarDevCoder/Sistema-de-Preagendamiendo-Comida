import { db } from "@/lib/db";
import type { PushSubscriptionInput } from "./push-schema";

/**
 * Guarda (o actualiza) la suscripción push de un dispositivo. El endpoint es
 * único: si el dispositivo estaba asociado a otra cuenta (cambio de sesión),
 * pasa a la cuenta actual para no mandarle avisos ajenos.
 */
export async function savePushSubscription(userId: string, sub: PushSubscriptionInput, userAgent: string | null) {
  const data = {
    userId,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
    userAgent: userAgent?.slice(0, 300) ?? null,
  };
  await db.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { endpoint: sub.endpoint, ...data },
    update: data,
  });
}

export async function removePushSubscription(userId: string, endpoint: string): Promise<number> {
  const { count } = await db.pushSubscription.deleteMany({ where: { userId, endpoint } });
  return count;
}

/**
 * Push de prueba a todos los dispositivos del usuario (para verificar la
 * configuración VAPID desde /cuenta/notificaciones). No crea filas Notification.
 */
export async function sendTestPush(userId: string): Promise<{ sent: number; failed: number; removed: number }> {
  const { getPushSender } = await import("./push/sender");
  const sender = getPushSender();
  if (!sender) return { sent: 0, failed: 0, removed: 0 };
  const targets = await db.pushSubscription.findMany({
    where: { userId },
    select: { endpoint: true, p256dh: true, auth: true },
  });
  let sent = 0;
  let failed = 0;
  let removed = 0;
  for (const t of targets) {
    const r = await sender.send(
      t,
      {
        title: "¡Las notificaciones funcionan!",
        body: "Así te vamos a avisar cuando tu pedido esté confirmado o listo.",
        url: "/cuenta/notificaciones",
        tag: "prueba",
      },
      { ttlSeconds: 60 },
    );
    if (r.ok) sent++;
    else {
      failed++;
      if (r.gone) removed += await removePushSubscription(userId, t.endpoint);
    }
  }
  return { sent, failed, removed };
}
