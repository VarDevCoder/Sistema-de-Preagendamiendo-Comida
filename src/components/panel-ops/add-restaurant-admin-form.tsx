"use client";

import { useActionState, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Field } from "@/components/auth/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { addRestaurantAdminAction, type AdminFormState } from "@/modules/admin/actions";

export function AddRestaurantAdminForm({ restaurantId }: { restaurantId: string }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(addRestaurantAdminAction, {});
  const [ownerMode, setOwnerMode] = useState<"new" | "existing">("existing");
  const v = state.values ?? {};

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

      <Tabs value={ownerMode} onValueChange={(v) => setOwnerMode(v as "new" | "existing")}>
        <TabsList>
          <TabsTrigger value="existing">Usuario existente</TabsTrigger>
          <TabsTrigger value="new">Crear usuario</TabsTrigger>
        </TabsList>
        <input type="hidden" name="ownerMode" value={ownerMode} />
        <TabsContent value="existing" className="grid gap-4 pt-2">
          <Field
            name="existingOwnerEmail"
            label="Email del administrador"
            type="email"
            required={ownerMode === "existing"}
            defaultValue={v.existingOwnerEmail}
            errors={state.fieldErrors?.existingOwnerEmail}
          />
        </TabsContent>
        <TabsContent value="new" className="grid gap-4 pt-2">
          <Field name="ownerName" label="Nombre" required={ownerMode === "new"} defaultValue={v.ownerName} errors={state.fieldErrors?.ownerName} />
          <Field
            name="ownerEmail"
            label="Email"
            type="email"
            required={ownerMode === "new"}
            defaultValue={v.ownerEmail}
            errors={state.fieldErrors?.ownerEmail}
          />
          <Field
            name="ownerPassword"
            label="Contraseña inicial"
            type="password"
            required={ownerMode === "new"}
            minLength={8}
            errors={state.fieldErrors?.ownerPassword}
          />
        </TabsContent>
      </Tabs>

      <Button type="submit" disabled={pending} variant="outline" className="justify-self-start">
        {pending ? "Agregando…" : "Agregar administrador"}
      </Button>
    </form>
  );
}
