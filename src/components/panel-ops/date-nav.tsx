import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateShort } from "@/modules/production/format";
import { addDays, type DateKey } from "@/modules/shared/time";

/** Navegación por día (?fecha=AAAA-MM-DD). Funciona sin JavaScript (links + form GET). */
export function DateNav({ basePath, date, today }: { basePath: string; date: DateKey; today: DateKey }) {
  const href = (d: DateKey) => `${basePath}?fecha=${d}`;
  const tomorrow = addDays(today, 1);
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <div className="flex items-center gap-1">
        <Button asChild variant="outline" size="icon" aria-label="Día anterior">
          <Link href={href(addDays(date, -1))}>
            <ChevronLeft />
          </Link>
        </Button>
        <Button asChild variant={date === today ? "default" : "outline"} size="sm">
          <Link href={href(today)}>Hoy</Link>
        </Button>
        <Button asChild variant={date === tomorrow ? "default" : "outline"} size="sm">
          <Link href={href(tomorrow)}>Mañana</Link>
        </Button>
        <Button asChild variant="outline" size="icon" aria-label="Día siguiente">
          <Link href={href(addDays(date, 1))}>
            <ChevronRight />
          </Link>
        </Button>
      </div>
      <form action={basePath} method="get" className="flex items-center gap-1">
        <label htmlFor="fecha" className="sr-only">
          Elegí una fecha
        </label>
        <input
          id="fecha"
          type="date"
          name="fecha"
          defaultValue={date}
          className="h-9 rounded-md border border-input bg-card px-2 text-sm"
        />
        <Button type="submit" variant="secondary" size="sm">
          Ver
        </Button>
      </form>
      <span className="text-sm text-muted-foreground">{formatDateShort(date)}</span>
    </div>
  );
}
