import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { googleEnabled } from "@/auth";
import { GoogleButton } from "@/components/auth/google-button";
import { RegisterForm } from "@/components/auth/register-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function RegisterPage() {
  return (
    <div className="mx-auto grid w-full max-w-sm gap-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Crear cuenta</CardTitle>
          <CardDescription>Pagás por adelantado y ahorrás en cada pedido.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {googleEnabled ? <GoogleButton /> : null}
          <Suspense>
            <RegisterForm />
          </Suspense>
          <p className="text-center text-sm text-muted-foreground">
            ¿Ya tenés cuenta?{" "}
            <Link href="/ingresar" className="font-medium text-primary underline-offset-4 hover:underline">
              Ingresá
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
