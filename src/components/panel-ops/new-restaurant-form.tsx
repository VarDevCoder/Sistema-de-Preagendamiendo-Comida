"use client";

import { useActionState, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Field } from "@/components/auth/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { createRestaurantAction, type AdminFormState } from "@/modules/admin/actions";
import { bpsToPercentInput } from "@/modules/admin/schemas";

export function NewRestaurantForm({
  zones,
  defaultCommissionBps,
}: {
  zones: { id: string; name: string }[];
  defaultCommissionBps: number;
}) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(createRestaurantAction, {});
  const [ownerMode, setOwnerMode] = useState<"new" | "existing">("new");
  const v = state.values ?? {};

  return (
    <form action={action} className="grid gap-6">
      {state.error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Datos del local</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field name="name" label="Nombre" required defaultValue={v.name} errors={state.fieldErrors?.name} />
          <Field
            name="slug"
            label="Dirección web (slug)"
            required
            placeholder="la-cocina-de-rosa"
            defaultValue={v.slug}
            errors={state.fieldErrors?.slug}
          />
          <Field name="addressLine" label="Dirección" required defaultValue={v.addressLine} errors={state.fieldErrors?.addressLine} />
          <div className="grid gap-2">
            <Label htmlFor="zoneId">Zona</Label>
            <NativeSelect id="zoneId" name="zoneId" required defaultValue={v.zoneId ?? ""} aria-invalid={state.fieldErrors?.zoneId ? true : undefined}>
              <option value="" disabled>
                Elegí una zona
              </option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </NativeSelect>
            {state.fieldErrors?.zoneId ? <p className="text-sm text-destructive">{state.fieldErrors.zoneId[0]}</p> : null}
          </div>
          <Field name="phone" label="Teléfono (opcional)" type="tel" defaultValue={v.phone} errors={state.fieldErrors?.phone} />
          <Field name="email" label="Email (opcional)" type="email" defaultValue={v.email} errors={state.fieldErrors?.email} />
          <div className="grid gap-2">
            <Label htmlFor="description">Descripción (opcional)</Label>
            <Textarea id="description" name="description" rows={3} defaultValue={v.description} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Condiciones comerciales</CardTitle>
          <CardDescription>Comisión de la plataforma y política si el restaurante cancela un pedido.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field
            name="commission"
            label="Comisión (%)"
            required
            inputMode="decimal"
            defaultValue={v.commission ?? bpsToPercentInput(defaultCommissionBps)}
            errors={state.fieldErrors?.commission}
          />
          <div className="flex items-start gap-2">
            <Checkbox id="refundsCommission" name="refundsCommission" defaultChecked />
            <Label htmlFor="refundsCommission" className="font-normal">
              Si el restaurante cancela, la plataforma devuelve su comisión
            </Label>
          </div>
          <Field
            name="penalty"
            label="Penalidad adicional (%, 0 = sin penalidad)"
            required
            inputMode="decimal"
            defaultValue={v.penalty ?? "0"}
            errors={state.fieldErrors?.penalty}
          />
          <div className="flex items-start gap-2">
            <Checkbox id="macrosRequired" name="macrosRequired" />
            <Label htmlFor="macrosRequired" className="font-normal">
              No se puede publicar un plato sin información nutricional
            </Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Administrador del restaurante</CardTitle>
          <CardDescription>Quién va a gestionar el menú, los pedidos y la producción.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={ownerMode} onValueChange={(v) => setOwnerMode(v as "new" | "existing")}>
            <TabsList>
              <TabsTrigger value="new">Crear usuario</TabsTrigger>
              <TabsTrigger value="existing">Usuario existente</TabsTrigger>
            </TabsList>
            <input type="hidden" name="ownerMode" value={ownerMode} />
            <TabsContent value="new" className="grid gap-4 pt-2">
              <Field name="ownerName" label="Nombre del responsable" required={ownerMode === "new"} defaultValue={v.ownerName} errors={state.fieldErrors?.ownerName} />
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
            <TabsContent value="existing" className="grid gap-4 pt-2">
              <Field
                name="existingOwnerEmail"
                label="Email del administrador"
                type="email"
                required={ownerMode === "existing"}
                defaultValue={v.existingOwnerEmail}
                errors={state.fieldErrors?.existingOwnerEmail}
              />
              <p className="text-sm text-muted-foreground">Tiene que ser un usuario existente con rol de restaurante activo.</p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Creando…" : "Crear restaurante"}
      </Button>
    </form>
  );
}
