"use client";

import { useFormStatus } from "react-dom";
import { AlertCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ActionState } from "@/modules/restaurants/form";

// Piezas de formulario del panel. Los valores iniciales son strings
// (checkbox = "on" | ""): si la action devolvió `values` (hubo errores) se
// usan esos, así no se pierde lo que escribió el usuario.

export function formView(state: ActionState, initial: Record<string, string>) {
  return {
    text: (k: string) => (state.values ? (state.values[k] ?? "") : (initial[k] ?? "")),
    checked: (k: string) => (state.values ? state.values[k] === "on" : initial[k] === "on"),
    error: (k: string) => state.fieldErrors?.[k]?.[0],
  };
}

export function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}

export function TextField({
  name,
  label,
  error,
  hint,
  className,
  ...props
}: React.ComponentProps<typeof Input> & { name: string; label: string; error?: string; hint?: string }) {
  const id = props.id ?? `f-${name}`;
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {hint && !error ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

/** Interruptor con un checkbox nativo (funciona con FormData y con el reset del form). */
export function ToggleField({
  name,
  label,
  description,
  defaultChecked,
  error,
  disabled,
  id,
}: {
  name: string;
  label: string;
  description?: string;
  defaultChecked?: boolean;
  error?: string;
  disabled?: boolean;
  id?: string;
}) {
  const inputId = id ?? `f-${name}`;
  return (
    <div className="grid gap-1">
      <label htmlFor={inputId} className="flex cursor-pointer items-center justify-between gap-4 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
        <span className="grid gap-0.5">
          <span className="text-sm font-medium">{label}</span>
          {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
        </span>
        <SwitchVisual>
          <input
            id={inputId}
            type="checkbox"
            role="switch"
            name={name}
            defaultChecked={defaultChecked}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            className="peer sr-only"
          />
        </SwitchVisual>
      </label>
      <FieldError message={error} />
    </div>
  );
}

/** Dibujo del switch; el <input class="peer sr-only"> va como hijo. */
export function SwitchVisual({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative inline-flex h-6 w-11 shrink-0">
      {children}
      <span className="absolute inset-0 rounded-full bg-input transition-colors peer-checked:bg-primary peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50" />
      <span className="pointer-events-none absolute top-0.5 left-0.5 size-5 rounded-full bg-background shadow-sm transition-transform peer-checked:translate-x-5" />
    </span>
  );
}

/** Chip seleccionable (checkbox nativo), ej. días de la semana. */
export function ChipCheckbox({
  name,
  label,
  defaultChecked,
  title,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
  title?: string;
}) {
  return (
    <label title={title} className="cursor-pointer">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" aria-label={title ?? label} />
      <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-full border bg-card px-3 text-sm font-medium text-muted-foreground transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50">
        {label}
      </span>
    </label>
  );
}

export function SubmitButton({
  children,
  pendingLabel = "Guardando…",
  ...props
}: React.ComponentProps<typeof Button> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}

/** Mensajes del resultado: error general, aviso no bloqueante y éxito. */
export function FormMessages({ state, className }: { state: ActionState; className?: string }) {
  if (!state.error && !state.warning && !state.message) return null;
  return (
    <div className={cn("grid gap-2", className)} aria-live="polite">
      {state.error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.warning ? (
        <Alert className="border-warning bg-warning/15">
          <AlertTriangle />
          <AlertDescription className="text-foreground">{state.warning}</AlertDescription>
        </Alert>
      ) : null}
      {state.ok && state.message ? (
        <p className="flex items-center gap-1.5 text-sm text-success">
          <CheckCircle2 className="size-4" />
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
