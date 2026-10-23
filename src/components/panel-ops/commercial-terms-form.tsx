"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateCommercialTermsAction, type AdminFormState } from "@/modules/admin/actions";
import { bpsToPercentInput } from "@/modules/admin/schemas";

export function CommercialTermsForm({
  restaurantId,
  commissionBps,
  refundsCommission,
  penaltyBps,
  macrosRequired,
}: {
  restaurantId: string;
  commissionBps: number;
  refundsCommission: boolean;
  penaltyBps: number;
  macrosRequired: boolean;
}) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(updateCommercialTermsAction, {});

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="restaurantId" value={restaurantId} />
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

      <div className="grid gap-2">
        <Label htmlFor="commission">Comisión (%)</Label>
        <Input
          id="commission"
          name="commission"
          inputMode="decimal"
          required
          defaultValue={bpsToPercentInput(commissionBps)}
          aria-invalid={state.fieldErrors?.commission ? true : undefined}
        />
        {state.fieldErrors?.commission ? <p className="text-sm text-destructive">{state.fieldErrors.commission[0]}</p> : null}
      </div>

      <div className="flex items-start gap-2">
        <Checkbox id="refundsCommission" name="refundsCommission" defaultChecked={refundsCommission} />
        <Label htmlFor="refundsCommission" className="font-normal">
          Si el restaurante cancela, la plataforma devuelve su comisión
        </Label>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="penalty">Penalidad adicional (%, 0 = sin penalidad)</Label>
        <Input
          id="penalty"
          name="penalty"
          inputMode="decimal"
          required
          defaultValue={bpsToPercentInput(penaltyBps)}
          aria-invalid={state.fieldErrors?.penalty ? true : undefined}
        />
        {state.fieldErrors?.penalty ? <p className="text-sm text-destructive">{state.fieldErrors.penalty[0]}</p> : null}
      </div>

      <div className="flex items-start gap-2">
        <Checkbox id="macrosRequired" name="macrosRequired" defaultChecked={macrosRequired} />
        <Label htmlFor="macrosRequired" className="font-normal">
          No se puede publicar un plato sin información nutricional
        </Label>
      </div>

      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Guardando…" : "Guardar condiciones"}
      </Button>
    </form>
  );
}
