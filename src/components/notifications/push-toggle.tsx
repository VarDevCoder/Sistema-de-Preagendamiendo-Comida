"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

// Activa / desactiva las notificaciones push en ESTE dispositivo.
// La suscripción vive en el navegador (PushManager) y se registra en el
// servidor vía /api/push/suscribir para poder mandarle avisos.

type Status =
  | "loading"
  | "unsupported"
  | "ios-install" // iPhone sin instalar: push solo funciona con la app en inicio (iOS 16.4+)
  | "server-disabled"
  | "denied"
  | "off"
  | "on";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (!existing) await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  return navigator.serviceWorker.ready;
}

function detectStatus(vapidPublicKey: string | null): Status | null {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    return ios ? "ios-install" : "unsupported";
  }
  if (!vapidPublicKey) return "server-disabled";
  if (Notification.permission === "denied") return "denied";
  return null; // depende de si hay suscripción
}

export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const fixed = detectStatus(vapidPublicKey);
    if (fixed) return setStatus(fixed);
    const registration = await navigator.serviceWorker.getRegistration("/");
    const sub = await registration?.pushManager.getSubscription();
    if (sub) {
      // Re-sincroniza con el servidor (pudo haberse borrado o cambiado de cuenta).
      void postJson("/api/push/suscribir", sub.toJSON()).catch(() => undefined);
    }
    setStatus(sub ? "on" : "off");
  }, [vapidPublicKey]);

  useEffect(() => {
    const t = setTimeout(() => void refresh().catch(() => setStatus("unsupported")), 0);
    return () => clearTimeout(t);
  }, [refresh]);

  async function enable() {
    if (!vapidPublicKey) return;
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setStatus(permission === "denied" ? "denied" : "off");
      return;
    }
    const registration = await getRegistration();
    const options = { userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) };
    let sub: PushSubscription;
    try {
      sub = await registration.pushManager.subscribe(options);
    } catch {
      // Suscripción previa con otra clave VAPID (se rotaron las claves): se rehace.
      await (await registration.pushManager.getSubscription())?.unsubscribe();
      sub = await registration.pushManager.subscribe(options);
    }
    const res = await postJson("/api/push/suscribir", sub.toJSON());
    if (!res.ok) {
      await sub.unsubscribe().catch(() => undefined);
      throw new Error(`Servidor respondió ${res.status}`);
    }
    setStatus("on");
    setMessage("Listo: te vamos a avisar en este dispositivo.");
  }

  async function disable() {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const sub = await registration?.pushManager.getSubscription();
    if (sub) {
      await postJson("/api/push/desuscribir", { endpoint: sub.endpoint }).catch(() => undefined);
      await sub.unsubscribe();
    }
    setStatus("off");
    setMessage("Desactivaste las notificaciones en este dispositivo.");
  }

  async function toggle(checked: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      await (checked ? enable() : disable());
    } catch (err) {
      console.error(err);
      setMessage("No pudimos cambiar las notificaciones. Probá de nuevo.");
      await refresh().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await postJson("/api/push/prueba", {});
      const data = (await res.json()) as { sent?: number };
      setMessage(data.sent ? "Te mandamos una notificación de prueba." : "No pudimos entregar la prueba a este dispositivo.");
    } catch {
      setMessage("No pudimos enviar la prueba.");
    } finally {
      setBusy(false);
    }
  }

  const hint: Partial<Record<Status, string>> = {
    unsupported: "Este navegador no soporta notificaciones push. Igual te avisamos por email y en esta bandeja.",
    "ios-install":
      "En iPhone, primero instalá la app (Compartir → “Agregar a inicio”) y abrila desde el ícono para activar los avisos.",
    "server-disabled": "Las notificaciones push todavía no están disponibles. Te avisamos por email y en esta bandeja.",
    denied: "Bloqueaste las notificaciones para este sitio. Habilitalas desde la configuración del navegador.",
  };
  const canToggle = status === "on" || status === "off";

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <BellRing className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
          <div className="grid gap-0.5">
            <Label htmlFor="push-toggle" className="text-base">
              Notificaciones en este dispositivo
            </Label>
            <p className="text-sm text-muted-foreground">Confirmación, recordatorio del día anterior y pedido listo.</p>
          </div>
        </div>
        <Switch
          id="push-toggle"
          checked={status === "on"}
          disabled={!canToggle || busy}
          onCheckedChange={(checked) => void toggle(checked)}
          aria-describedby="push-toggle-status"
        />
      </div>
      <p id="push-toggle-status" className="text-sm text-muted-foreground" aria-live="polite">
        {message ?? hint[status] ?? (status === "loading" ? "Revisando este dispositivo…" : null)}
      </p>
      {status === "on" ? (
        <Button variant="outline" size="sm" className="justify-self-start" onClick={() => void sendTest()} disabled={busy}>
          <Send /> Enviar prueba
        </Button>
      ) : null}
    </div>
  );
}
