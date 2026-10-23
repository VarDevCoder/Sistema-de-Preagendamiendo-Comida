"use client";

import { useEffect, useState } from "react";
import { Share, SquarePlus, UtensilsCrossed, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { brand } from "@/lib/brand";

// Aviso discreto para instalar la app:
// - Android / Chrome de escritorio: botón "Instalar" (evento beforeinstallprompt).
// - iPhone / iPad: instrucción "Compartir → Agregar a inicio" (Safari no tiene prompt).
// Se puede descartar y se recuerda por DISMISS_DAYS en este dispositivo.

const STORAGE_KEY = "pwa-install-dismissed-at";
const DISMISS_DAYS = 30;
const SHOW_DELAY_MS = 2500;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Mode = { kind: "hidden" } | { kind: "native"; event: BeforeInstallPromptEvent } | { kind: "ios" };

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

function rememberDismiss() {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // Almacenamiento bloqueado (modo privado): se vuelve a mostrar la próxima vez.
  }
}

export function InstallPrompt() {
  const [mode, setMode] = useState<Mode>({ kind: "hidden" });

  useEffect(() => {
    if (isStandalone() || dismissedRecently()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // usamos nuestro propio aviso en lugar del mini-infobar
      clearTimeout(timer);
      const event = e as BeforeInstallPromptEvent;
      timer = setTimeout(() => setMode({ kind: "native", event }), SHOW_DELAY_MS);
    };
    const onInstalled = () => {
      rememberDismiss();
      setMode({ kind: "hidden" });
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    if (isIos()) timer = setTimeout(() => setMode({ kind: "ios" }), SHOW_DELAY_MS);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (mode.kind === "hidden") return null;

  const dismiss = () => {
    rememberDismiss();
    setMode({ kind: "hidden" });
  };

  const install = async () => {
    if (mode.kind !== "native") return;
    await mode.event.prompt();
    const { outcome } = await mode.event.userChoice;
    if (outcome === "dismissed") rememberDismiss();
    setMode({ kind: "hidden" }); // el evento solo se puede usar una vez
  };

  return (
    <div
      role="dialog"
      aria-label={`Instalar ${brand.name}`}
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-40 mx-auto max-w-md rounded-xl border bg-card p-3 text-card-foreground shadow-lg print:hidden"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
          <UtensilsCrossed className="size-5" />
        </span>
        <div className="grid min-w-0 flex-1 gap-0.5 text-sm">
          <p className="font-medium">Instalá {brand.name} en tu celular</p>
          {mode.kind === "native" ? (
            <p className="text-muted-foreground">Abrí tus pedidos más rápido, como una app.</p>
          ) : (
            <p className="text-muted-foreground">
              Tocá <Share className="inline size-4 align-text-bottom" aria-label="Compartir" /> y después{" "}
              <span className="whitespace-nowrap font-medium text-foreground">
                “Agregar a inicio” <SquarePlus className="inline size-4 align-text-bottom" aria-hidden />
              </span>
              .
            </p>
          )}
        </div>
        <Button variant="ghost" size="icon" className="-m-1 size-8 shrink-0" onClick={dismiss} aria-label="Ahora no">
          <X />
        </Button>
      </div>
      {mode.kind === "native" ? (
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={dismiss}>
            Ahora no
          </Button>
          <Button size="sm" onClick={install}>
            Instalar app
          </Button>
        </div>
      ) : null}
    </div>
  );
}
