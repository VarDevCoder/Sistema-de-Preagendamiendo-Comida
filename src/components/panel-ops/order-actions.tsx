"use client";

import { useActionState, useState } from "react";
import { AlertCircle, ArrowRight, XCircle } from "lucide-react";
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
import type { OrderStatus } from "@/generated/prisma/enums";
import { advanceOrderAction, cancelOrderAction, type OrderActionState } from "@/modules/orders/restaurant-actions";
import {
  CANCEL_REASON_MAX,
  canRestaurantCancel,
  KITCHEN_ACTION_LABEL,
  nextKitchenStatus,
} from "@/modules/orders/restaurant-transitions";
import { formatGs } from "@/modules/shared/money";

export function OrderActions({
  slug,
  orderId,
  code,
  status,
  total,
  isPlanDay,
  canPrepare,
}: {
  slug: string;
  orderId: string;
  code: string;
  status: OrderStatus;
  total: number;
  isPlanDay: boolean;
  canPrepare: boolean;
}) {
  const next = canPrepare ? nextKitchenStatus(status) : null;
  const [advanceState, advance, advancing] = useActionState<OrderActionState, FormData>(advanceOrderAction, {});

  return (
    <div className="grid gap-2">
      {advanceState.error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{advanceState.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {next ? (
          <form action={advance} className="flex-1">
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="to" value={next} />
            <Button type="submit" className="w-full" disabled={advancing}>
              {advancing ? "Guardando…" : KITCHEN_ACTION_LABEL[next]}
              <ArrowRight />
            </Button>
          </form>
        ) : null}
        {canRestaurantCancel(status) ? (
          <CancelOrderDialog slug={slug} orderId={orderId} code={code} total={total} isPlanDay={isPlanDay} />
        ) : null}
      </div>
    </div>
  );
}

function CancelOrderDialog({
  slug,
  orderId,
  code,
  total,
  isPlanDay,
}: {
  slug: string;
  orderId: string;
  code: string;
  total: number;
  isPlanDay: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<OrderActionState, FormData>(cancelOrderAction, {});
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="text-destructive">
          <XCircle />
          Cancelar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar el pedido {code}</DialogTitle>
          <DialogDescription>
            El cliente recibe al instante {formatGs(total)} en su billetera
            {isPlanDay ? " (el valor de este día de su plan mensual)" : ""}. La cancelación queda registrada en tus métricas.
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="orderId" value={orderId} />
          {state.error ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}
          {state.ok && state.message ? (
            <Alert>
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor={`reason-${orderId}`}>Motivo (obligatorio, lo ve el cliente)</Label>
            <Textarea
              id={`reason-${orderId}`}
              name="reason"
              required
              minLength={5}
              maxLength={CANCEL_REASON_MAX}
              placeholder="Ej.: Nos quedamos sin gas en la cocina"
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
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Cancelando…" : "Cancelar y reembolsar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
