import Link from "next/link";
import { cn } from "@/lib/utils";
import { PERIOD_OPTIONS, type PeriodDays } from "@/modules/metrics/calc";

/** Selector de período (7/30 días) con links: funciona sin JavaScript. */
export function PeriodTabs({ basePath, period }: { basePath: string; period: PeriodDays }) {
  return (
    <nav aria-label="Período" className="inline-flex h-10 w-fit items-center rounded-lg bg-muted p-1 text-sm">
      {PERIOD_OPTIONS.map((p) => (
        <Link
          key={p}
          href={`${basePath}?periodo=${p}`}
          aria-current={p === period ? "page" : undefined}
          className={cn(
            "inline-flex h-full items-center rounded-md px-3 font-medium text-muted-foreground",
            p === period && "bg-card text-foreground shadow-sm",
          )}
        >
          Últimos {p} días
        </Link>
      ))}
    </nav>
  );
}
