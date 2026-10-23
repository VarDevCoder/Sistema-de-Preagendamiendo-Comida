"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, ChefHat, Clock, LayoutDashboard, ListChecks, Settings, SlidersHorizontal, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";

// Navegación del panel: pestañas con scroll horizontal (mobile-first).
// Resumen, Pedidos y Producción son de la Fase 7.
const ITEMS = [
  { href: "", label: "Resumen", icon: LayoutDashboard },
  { href: "/pedidos", label: "Pedidos", icon: ListChecks },
  { href: "/produccion", label: "Producción", icon: ChefHat },
  { href: "/menu", label: "Menú", icon: UtensilsCrossed },
  { href: "/modificadores", label: "Modificadores", icon: SlidersHorizontal },
  { href: "/disponibilidad", label: "Disponibilidad", icon: CalendarClock },
  { href: "/franjas", label: "Franjas", icon: Clock },
  { href: "/configuracion", label: "Configuración", icon: Settings },
] as const;

export function PanelNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/panel/${slug}`;
  return (
    <nav aria-label="Secciones del panel" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ul className="flex w-max gap-1.5 pb-1">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const target = `${base}${href}`;
          const active = href === "" ? pathname === base : pathname === target || pathname.startsWith(`${target}/`);
          return (
            <li key={label}>
              <Link
                href={target}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-card text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
