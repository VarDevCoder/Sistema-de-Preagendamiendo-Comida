"use client";

import { useActionState, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { RestaurantStatus } from "@/generated/prisma/enums";
import { changeRestaurantStatusAction, type AdminFormState } from "@/modules/admin/actions";
import { RESTAURANT_STATUS_LABEL } from "@/modules/shared/labels";

const TRANSITIONS: Partial<Record<RestaurantStatus, { to: RestaurantStatus; label: string; needsReason: boolean; destructive: boolean }[]>> = {
  PENDING: [{ to: "ACTIVE", label: "Activar", needsReason: false, destructive: false }],
  ACTIVE: [{ to: "SUSPENDED", label: "Suspender", needsReason: true, destructive: true }],
  SUSPENDED: [
    { to: "ACTIVE", label: "Reactivar", needsReason: false, destructive: false },
    { to: "CLOSED", label: "Dar de baja", needsReason: true, destructive: true },
  ],
  CLOSED: [{ to: "ACTIVE", label: "Reactivar", needsReason: false, destructive: false }],
};

export function RestaurantStatusForm({ restaurantId, status }: { restaurantId: string; status: RestaurantStatus }) {
  const transitions = TRANSITIONS[status] ?? [];
  return (
    <div className="flex flex-wrap gap-2">
      {transitions.map((t) =>
        t.needsReason ? (
          <StatusChangeDialog key={t.to} restaurantId={restaurantId} to={t.to} label={t.label} destructive={t.destructive} />
        ) : (
          <SimpleStatusChange key={t.to} restaurantId={restaurantId} to={t.to} label={t.label} />
        ),
      )}
    </div>
  );
}

function SimpleStatusChange({ restaurantId, to, label }: { restaurantId: string; to: RestaurantStatus; label: string }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(changeRestaurantStatusAction, {});
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <input type="hidden" name="status" value={to} />
      {state.error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.ok && state.message ? (
        <Alert>
          <CheckCircle2 />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending} variant="outline">
        {pending ? "Guardando…" : label}
      </Button>
    </form>
  );
}

function StatusChangeDialog({
  restaurantId,
  to,
  label,
  destructive,
}: {
  restaurantId: string;
  to: RestaurantStatus;
  label: string;
  destructive: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<AdminFormState, FormData>(changeRestaurantStatusAction, {});
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className={destructive ? "text-destructive" : undefined}>
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {label} el restaurante → {RESTAURANT_STATUS_LABEL[to]}
          </DialogTitle>
          <DialogDescription>No afecta los pedidos ya pagos: siguen su curso. Solo deja de recibir pedidos nuevos.</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="restaurantId" value={restaurantId} />
          <input type="hidden" name="status" value={to} />
          {state.error ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor={`reason-${to}`}>Motivo (obligatorio, queda registrado)</Label>
            <Textarea
              id={`reason-${to}`}
              name="reason"
              required
              minLength={3}
              placeholder="Ej.: Dejó de pagar la comisión acordada"
              aria-invalid={state.fieldErrors?.reason ? true : undefined}
            />
            {state.fieldErrors?.reason ? <p className="text-sm text-destructive">{state.fieldErrors.reason[0]}</p> : null}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Volver
              </Button>
            </DialogClose>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending}>
              {pending ? "Guardando…" : label}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
