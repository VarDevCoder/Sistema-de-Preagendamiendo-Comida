import type { NotificationChannel, NotificationType } from "@/generated/prisma/enums";
import { selectChannels } from "./channels";
import type { NotificationContent } from "./content";
import type { EmailProvider } from "./email/providers";
import { renderEmail } from "./email/template";
import type { NotificationEvent } from "./events";
import { dedupeKey } from "./keys";
import type { PushSender, PushTarget } from "./push/sender";

// Núcleo del envío, independiente de Prisma y de Next: recibe sus dependencias
// (resolver, almacenamiento y proveedores) para poder probarlo con mocks.
// Flujo: resolver destinatario y contenido → elegir canales → insertar filas
// Notification ignorando duplicados (dedupeKey) → enviar SOLO las filas recién
// creadas → marcar SENT / FAILED. Nunca lanza.

export type ResolvedNotification = {
  userId: string;
  userActive: boolean;
  email: string | null;
  name: string | null;
  orderId: string | null;
  /** Ver keys.ts → eventKey(). */
  eventKey: string;
  content: NotificationContent;
};

export type NewNotificationRow = {
  userId: string;
  orderId: string | null;
  type: NotificationType;
  channel: NotificationChannel;
  title: string;
  body: string;
  data: { url: string; eventKey: string };
  dedupeKey: string;
  status: "PENDING" | "SENT";
  sentAt: Date | null;
};

export interface NotificationStore {
  countPushSubscriptions(userId: string): Promise<number>;
  listPushSubscriptions(userId: string): Promise<PushTarget[]>;
  deletePushSubscription(endpoint: string): Promise<void>;
  /** Inserta ignorando dedupeKey repetidas; devuelve SOLO las filas creadas ahora. */
  insertNew(rows: NewNotificationRow[]): Promise<{ id: string; channel: NotificationChannel }[]>;
  markSent(id: string, at: Date): Promise<void>;
  markFailed(id: string, error: string): Promise<void>;
}

export type NotifierDeps = {
  resolve: (event: NotificationEvent) => Promise<ResolvedNotification | null>;
  store: NotificationStore;
  email: EmailProvider | null;
  push: PushSender | null;
  baseUrl: string;
  now?: () => Date;
  logError?: (message: string, error?: unknown) => void;
};

export type DeliveryReport = {
  eventKey: string | null;
  /** Canales cuya fila se creó en esta llamada (vacío si ya se había notificado). */
  created: NotificationChannel[];
  sent: NotificationChannel[];
  failed: NotificationChannel[];
  error?: string;
};

const MAX_ERROR = 500;
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, MAX_ERROR);

// Un aviso de "pedido listo" no sirve horas después; el resto puede esperar un día.
function pushTtlSeconds(type: NotificationType): number {
  return type === "ORDER_READY" ? 3 * 60 * 60 : 24 * 60 * 60;
}

export function createNotifier(deps: NotifierDeps) {
  const now = deps.now ?? (() => new Date());
  const logError = deps.logError ?? ((message, error) => console.error(`[notificaciones] ${message}`, error ?? ""));

  async function sendEmail(resolved: ResolvedNotification, key: string): Promise<void> {
    if (!deps.email || !resolved.email) throw new Error("Email no disponible");
    const rendered = renderEmail(resolved.content, { baseUrl: deps.baseUrl, recipientName: resolved.name });
    await deps.email.send({ to: resolved.email, ...rendered, idempotencyKey: key });
  }

  async function sendPush(resolved: ResolvedNotification): Promise<void> {
    if (!deps.push) throw new Error("Push no configurado");
    const targets = await deps.store.listPushSubscriptions(resolved.userId);
    if (targets.length === 0) throw new Error("El usuario no tiene dispositivos suscriptos");
    const payload = {
      title: resolved.content.title,
      body: resolved.content.body,
      url: resolved.content.url,
      tag: resolved.eventKey,
    };
    const results = await Promise.all(
      targets.map((t) => deps.push!.send(t, payload, { ttlSeconds: pushTtlSeconds(resolved.content.type) })),
    );
    const errors: string[] = [];
    await Promise.all(
      results.map(async (r, i) => {
        if (r.ok) return;
        errors.push(r.error);
        if (r.gone) await deps.store.deletePushSubscription(targets[i].endpoint);
      }),
    );
    // Alcanza con que llegue a un dispositivo.
    if (!results.some((r) => r.ok)) throw new Error(errors.join(" | ") || "Ningún dispositivo aceptó el push");
  }

  return async function deliver(event: NotificationEvent): Promise<DeliveryReport> {
    const report: DeliveryReport = { eventKey: null, created: [], sent: [], failed: [] };
    try {
      const resolved = await deps.resolve(event);
      if (!resolved) return report; // entidad inexistente o evento que no aplica
      report.eventKey = resolved.eventKey;

      const pushSubscriptions =
        deps.push && resolved.userActive ? await deps.store.countPushSubscriptions(resolved.userId) : 0;
      const channels = selectChannels({
        userActive: resolved.userActive,
        email: resolved.email,
        emailEnabled: deps.email !== null,
        pushEnabled: deps.push !== null,
        pushSubscriptions,
      });

      const at = now();
      const rows: NewNotificationRow[] = channels.map((channel) => ({
        userId: resolved.userId,
        orderId: resolved.orderId,
        type: resolved.content.type,
        channel,
        title: resolved.content.title,
        body: resolved.content.body,
        data: { url: resolved.content.url, eventKey: resolved.eventKey },
        dedupeKey: dedupeKey(resolved.eventKey, channel),
        // La bandeja in-app queda "entregada" al crearse la fila.
        status: channel === "IN_APP" ? "SENT" : "PENDING",
        sentAt: channel === "IN_APP" ? at : null,
      }));

      const created = await deps.store.insertNew(rows);
      report.created = created.map((c) => c.channel);

      await Promise.all(
        created.map(async ({ id, channel }) => {
          if (channel === "IN_APP") {
            report.sent.push(channel);
            return;
          }
          try {
            if (channel === "EMAIL") await sendEmail(resolved, dedupeKey(resolved.eventKey, channel));
            else await sendPush(resolved);
            await deps.store.markSent(id, now());
            report.sent.push(channel);
          } catch (err) {
            report.failed.push(channel);
            logError(`Falló ${channel} de ${resolved.eventKey}`, err);
            await deps.store.markFailed(id, errorText(err)).catch((e) => logError("No se pudo marcar FAILED", e));
          }
        }),
      );
      return report;
    } catch (err) {
      logError(`No se pudo notificar ${event.type}`, err);
      report.error = errorText(err);
      return report;
    }
  };
}
