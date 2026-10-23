import { cn } from "@/lib/utils";

/** Número destacado con etiqueta y detalle opcional. */
export function StatTile({
  label,
  value,
  detail,
  className,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid content-start gap-1 rounded-xl border bg-card p-4 shadow-sm", className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}
