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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { ClaimStatus } from "@/generated/prisma/enums";
import { markClaimInReviewAction, resolveClaimAction, type ClaimFormState } from "@/modules/claims/actions";
import { CLAIM_ABSORBER_LABEL } from "@/modules/claims/rules";
import { formatGs } from "@/modules/shared/money";

export function ClaimActions({ claimId, status, maxRefund, code }: { claimId: string; status: ClaimStatus; maxRefund: number; code: string }) {
  if (status === "RESOLVED" || status === "REJECTED") return null;

  return (
    <div className="flex flex-wrap gap-2">
      {status === "OPEN" ? <MarkInReview claimId={claimId} /> : null}
      <ResolveDialog claimId={claimId} maxRefund={maxRefund} code={code} />
    </div>
  );
}

function MarkInReview({ claimId }: { claimId: string }) {
  const [state, action, pending] = useActionState<ClaimFormState, FormData>(markClaimInReviewAction, {});
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="claimId" value={claimId} />
      {state.error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Guardando…" : "Poner en revisión"}
      </Button>
    </form>
  );
}

function ResolveDialog({ claimId, maxRefund, code }: { claimId: string; maxRefund: number; code: string }) {
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<"RESOLVE" | "REJECT">("RESOLVE");
  const [state, action, pending] = useActionState<ClaimFormState, FormData>(resolveClaimAction, {});

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">Resolver</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolver el reclamo del pedido {code}</DialogTitle>
          <DialogDescription>Hasta {formatGs(maxRefund)} disponibles para reembolsar por este pedido.</DialogDescription>
        </DialogHeader>
        <form action={action} className="grid gap-4">
          <input type="hidden" name="claimId" value={claimId} />
          {state.error ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor={`decision-${claimId}`}>Decisión</Label>
            <NativeSelect
              id={`decision-${claimId}`}
              name="decision"
              value={decision}
              onChange={(e) => setDecision(e.target.value as "RESOLVE" | "REJECT")}
            >
              <option value="RESOLVE">Resolver a favor del cliente</option>
              <option value="REJECT">Rechazar</option>
            </NativeSelect>
          </div>

          <div className="grid gap-2">
            <Label htmlFor={`resolution-${claimId}`}>Explicación (la ve el cliente)</Label>
            <Textarea
              id={`resolution-${claimId}`}
              name="resolution"
              required
              minLength={5}
              maxLength={500}
              placeholder={decision === "RESOLVE" ? "Ej.: Confirmamos el error, te devolvemos el valor del plato" : "Ej.: Revisamos la producción y el pedido salió correcto"}
              aria-invalid={state.fieldErrors?.resolution ? true : undefined}
            />
            {state.fieldErrors?.resolution ? <p className="text-sm text-destructive">{state.fieldErrors.resolution[0]}</p> : null}
          </div>

          {decision === "RESOLVE" ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor={`refund-${claimId}`}>Reembolso a la billetera (Gs., 0 = sin reembolso)</Label>
                <Input
                  id={`refund-${claimId}`}
                  name="refundAmount"
                  inputMode="numeric"
                  placeholder="0"
                  aria-invalid={state.fieldErrors?.refundAmount ? true : undefined}
                />
                {state.fieldErrors?.refundAmount ? <p className="text-sm text-destructive">{state.fieldErrors.refundAmount[0]}</p> : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`absorber-${claimId}`}>Quién absorbe el reembolso</Label>
                <NativeSelect id={`absorber-${claimId}`} name="absorbedBy" defaultValue="" aria-invalid={state.fieldErrors?.absorbedBy ? true : undefined}>
                  <option value="">Sin reembolso</option>
                  {Object.entries(CLAIM_ABSORBER_LABEL).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
                {state.fieldErrors?.absorbedBy ? <p className="text-sm text-destructive">{state.fieldErrors.absorbedBy[0]}</p> : null}
              </div>
            </>
          ) : null}

          {state.ok && state.message ? (
            <Alert>
              <CheckCircle2 />
              <AlertDescription>{state.message}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Volver
              </Button>
            </DialogClose>
            <Button type="submit" variant={decision === "REJECT" ? "destructive" : "default"} disabled={pending}>
              {pending ? "Guardando…" : decision === "RESOLVE" ? "Resolver" : "Rechazar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
