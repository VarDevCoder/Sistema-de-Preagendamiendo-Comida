"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { registerAction, type FormState } from "@/modules/auth/actions";
import { Field } from "./field";

export function RegisterForm() {
  const callbackUrl = useSearchParams().get("callbackUrl") ?? "";
  const [state, action, pending] = useActionState<FormState, FormData>(registerAction, {});
  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      {state.error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Field
        name="name"
        label="Nombre"
        autoComplete="name"
        required
        defaultValue={state.values?.name}
        errors={state.fieldErrors?.name}
      />
      <Field
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.values?.email}
        errors={state.fieldErrors?.email}
      />
      <Field
        name="phone"
        label="Celular (opcional)"
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        placeholder="0981 123 456"
        defaultValue={state.values?.phone}
        errors={state.fieldErrors?.phone}
      />
      <Field
        name="password"
        label="Contraseña"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        errors={state.fieldErrors?.password}
      />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Creando cuenta…" : "Crear cuenta"}
      </Button>
    </form>
  );
}
