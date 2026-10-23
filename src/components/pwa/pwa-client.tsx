"use client";

import { useEffect } from "react";
import { InstallPrompt } from "./install-prompt";

// Registra el service worker (public/sw.js) y muestra el aviso de instalación.
// En `next dev` no se registra (el caché del SW confunde con el recargado en
// caliente), salvo que se pida con NEXT_PUBLIC_SW_IN_DEV=true.
const SW_ENABLED = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_SW_IN_DEV === "true";

export function PwaClient() {
  useEffect(() => {
    if (!SW_ENABLED || !("serviceWorker" in navigator)) return;
    const register = () =>
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch((err) => console.warn("No se pudo registrar el service worker", err));
    // Después de la carga, para no competir con los recursos de la página.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);

  return <InstallPrompt />;
}
