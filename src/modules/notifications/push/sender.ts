import { vapidConfig, type VapidConfig } from "../config";

// Envío de web push con VAPID usando `web-push`. Si faltan las claves, no hay
// sender y el canal PUSH simplemente no se usa.

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

/** Lo que recibe el service worker en el evento `push` (ver public/sw.js). */
export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};

export type PushResult = { ok: true } | { ok: false; gone: boolean; error: string };

export interface PushSender {
  send(target: PushTarget, payload: PushPayload, opts?: { ttlSeconds?: number }): Promise<PushResult>;
}

type WebPushModule = typeof import("web-push");

export class WebPushSender implements PushSender {
  private lib: Promise<WebPushModule> | null = null;
  constructor(private readonly vapid: VapidConfig) {}

  // Import diferido: el módulo solo se carga si push está configurado.
  private load(): Promise<WebPushModule> {
    this.lib ??= import("web-push").then((m) => ("default" in m ? (m.default as WebPushModule) : m));
    return this.lib;
  }

  async send(target: PushTarget, payload: PushPayload, opts: { ttlSeconds?: number } = {}): Promise<PushResult> {
    const webpush = await this.load();
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(payload),
        {
          vapidDetails: this.vapid,
          TTL: opts.ttlSeconds ?? 24 * 60 * 60,
          urgency: "normal",
          timeout: 10_000,
        },
      );
      return { ok: true };
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      // 404/410: la suscripción ya no existe (el usuario la revocó o expiró) → se borra.
      const gone = statusCode === 404 || statusCode === 410;
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, gone, error: statusCode ? `HTTP ${statusCode}: ${message}` : message };
    }
  }
}

export function getPushSender(env: Record<string, string | undefined> = process.env): PushSender | null {
  const vapid = vapidConfig(env);
  return vapid ? new WebPushSender(vapid) : null;
}
