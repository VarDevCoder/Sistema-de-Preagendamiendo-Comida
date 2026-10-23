import { MessageSquareText, TriangleAlert } from "lucide-react";
import type { Allergen } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { allergyText } from "@/modules/production/format";

// Alergias y notas SIEMPRE destacadas: color + ícono + etiqueta en texto
// (se leen igual impresas en blanco y negro: borde grueso y rótulo en mayúsculas).

export function AllergyFlag({
  allergens,
  other,
  className,
}: {
  allergens: Allergen[];
  other: string | null;
  className?: string;
}) {
  const text = allergyText(allergens, other);
  if (!text) return null;
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 rounded-md border-2 border-destructive bg-destructive/10 px-2 py-1 text-sm font-medium text-destructive print:border-black print:bg-transparent print:text-black",
        className,
      )}
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        <span className="font-bold tracking-wide uppercase">Alergia:</span> {text}
      </span>
    </p>
  );
}

export function NoteFlag({ text, label = "Nota", className }: { text: string | null; label?: string; className?: string }) {
  if (!text) return null;
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 rounded-md border border-dashed border-foreground/50 bg-warning/20 px-2 py-1 text-sm print:border-black print:bg-transparent",
        className,
      )}
    >
      <MessageSquareText className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        <span className="font-bold tracking-wide uppercase">{label}:</span> {text}
      </span>
    </p>
  );
}
