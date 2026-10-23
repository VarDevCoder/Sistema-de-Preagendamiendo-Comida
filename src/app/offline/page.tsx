import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { RetryButton } from "./retry-button";

// Página que muestra el service worker cuando una navegación falla por falta de
// red. Es estática (sin sesión ni base) para que se pueda guardar en caché.
export const metadata: Metadata = {
  title: "Sin conexión",
  robots: { index: false },
};

export default function OfflinePage() {
  return (
    <div className="grid flex-1 place-items-center py-16">
      <div className="grid max-w-sm justify-items-center gap-4 text-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-secondary text-muted-foreground">
          <WifiOff className="size-7" aria-hidden />
        </span>
        <div className="grid gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Estás sin conexión</h1>
          <p className="text-muted-foreground">
            No pudimos cargar esta página. Revisá tu conexión a internet y volvé a intentar.
          </p>
          <p className="text-sm text-muted-foreground">
            Tranquilo: tus pedidos confirmados y tu saldo siguen guardados.
          </p>
        </div>
        <RetryButton />
      </div>
    </div>
  );
}
