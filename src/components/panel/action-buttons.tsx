"use client";

import { useOptimistic, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ActionState } from "@/modules/restaurants/form";
import { SwitchVisual } from "./form-bits";

/** Botón que pide confirmación y ejecuta una action ya "bindeada" (ej. eliminar). */
export function ConfirmActionButton({
  action,
  title,
  description,
  confirmLabel = "Eliminar",
  children,
  variant = "outline",
  size = "sm",
  className,
}: {
  action: () => Promise<ActionState | void>;
  title: string;
  description?: string;
  confirmLabel?: string;
  children: React.ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant={variant} size={size} className={className}>
          {children}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await action();
                if (result?.error) setError(result.error);
                else setOpen(false);
              })
            }
          >
            {pending ? "Un momento…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Interruptor que guarda al instante (ej. "Disponible hoy", "Publicado").
 * Muestra el cambio en el acto y vuelve atrás si la action falla.
 */
export function ToggleAction({
  checked,
  action,
  label,
  srLabel,
}: {
  checked: boolean;
  action: (next: boolean) => Promise<ActionState>;
  label?: string;
  srLabel: string;
}) {
  const [optimistic, setOptimistic] = useOptimistic(checked);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  return (
    <div className="grid justify-items-end gap-1">
      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
        {label ? <span>{label}</span> : null}
        <SwitchVisual>
          <input
            type="checkbox"
            role="switch"
            aria-label={srLabel}
            className="peer sr-only"
            checked={optimistic}
            onChange={(e) => {
              const next = e.target.checked;
              setError(null);
              startTransition(async () => {
                setOptimistic(next);
                const result = await action(next);
                if (result.error) setError(result.error);
              });
            }}
          />
        </SwitchVisual>
      </label>
      {error ? <p className="max-w-60 text-right text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

/** Botón chico que ejecuta una action sin confirmación (ej. subir/bajar orden). */
export function ActionButton({
  action,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "onClick" | "action"> & { action: () => Promise<ActionState | void> }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      disabled={pending || props.disabled}
      onClick={() => startTransition(async () => void (await action()))}
      {...props}
    >
      {children}
    </Button>
  );
}
