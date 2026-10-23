import Link from "next/link";
import { cn } from "@/lib/utils";
import { WEEKDAY_SHORT } from "@/modules/restaurants/rules";
import { addDays, isoWeekday, type DateKey } from "@/modules/shared/time";

// Piezas de presentación del panel (server-safe, sin estado).

export function PanelSectionHeader({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 pt-5 pb-4">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

/** Pestañas como links (la pestaña elegida vive en la URL, ?tab=…). */
export function LinkTabs({ tabs, current }: { tabs: { href: string; label: string; key: string }[]; current: string }) {
  return (
    <div className="mb-4 inline-flex w-full rounded-lg bg-muted p-1 sm:w-auto" role="tablist">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          role="tab"
          aria-selected={t.key === current}
          className={cn(
            "flex h-9 flex-1 items-center justify-center rounded-md px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors sm:flex-none",
            t.key === current && "bg-card text-foreground shadow-sm",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

/** "Hoy", "Mañana", "Lun 26" */
export function dayLabel(date: DateKey, today: DateKey): { top: string; bottom: string } {
  const day = String(Number(date.slice(8, 10)));
  if (date === today) return { top: "Hoy", bottom: day };
  if (date === addDays(today, 1)) return { top: "Mañana", bottom: day };
  return { top: WEEKDAY_SHORT[isoWeekday(date)], bottom: day };
}

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const WEEKDAY_LONG = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

/** "martes 3 de noviembre" (sin depender de la zona horaria del servidor). */
export function longDate(date: DateKey): string {
  const [, m, d] = date.split("-").map(Number);
  return `${WEEKDAY_LONG[isoWeekday(date)]} ${d} de ${MONTHS[m - 1]}`;
}

/** Tira de días (próximas 2 semanas) para elegir una fecha. */
export function DateStrip({
  days,
  selected,
  today,
  hrefFor,
}: {
  days: { date: DateKey; closed: boolean }[];
  selected: DateKey;
  today: DateKey;
  hrefFor: (date: DateKey) => string;
}) {
  return (
    <div className="-mx-4 mb-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ul className="flex w-max gap-1.5">
        {days.map(({ date, closed }) => {
          const label = dayLabel(date, today);
          const active = date === selected;
          return (
            <li key={date}>
              <Link
                href={hrefFor(date)}
                scroll={false}
                aria-current={active ? "date" : undefined}
                title={closed ? "Feriado" : undefined}
                className={cn(
                  "grid h-14 w-14 place-content-center rounded-xl border text-center transition-colors",
                  active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-secondary",
                  closed && !active && "border-dashed text-muted-foreground line-through",
                )}
              >
                <span className="text-[11px] leading-tight font-medium">{label.top}</span>
                <span className="text-lg leading-tight font-semibold">{label.bottom}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Barra de ocupación (cupo o stock). */
export function UsageBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : used > 0 ? 100 : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
      <div className={cn("h-full rounded-full", pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-warning" : "bg-success")} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="grid justify-items-center gap-2 rounded-xl border border-dashed px-4 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children ? <div className="text-sm text-muted-foreground">{children}</div> : null}
    </div>
  );
}
