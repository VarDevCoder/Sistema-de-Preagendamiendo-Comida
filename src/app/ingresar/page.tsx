import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { googleEnabled } from "@/auth";
import { DemoAccounts } from "@/components/auth/demo-accounts";
import { GoogleButton } from "@/components/auth/google-button";
import { LoginForm } from "@/components/auth/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Ingresar" };

export default function LoginPage() {
  return (
    <div className="mx-auto grid w-full max-w-sm gap-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Ingresar</CardTitle>
          <CardDescription>Entrá para programar tus pedidos y ver tu billetera.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Suspense>
            <LoginForm />
          </Suspense>
          {googleEnabled ? (
            <>
              <Divider />
              <GoogleButton />
            </>
          ) : null}
          <p className="text-center text-sm text-muted-foreground">
            ¿No tenés cuenta?{" "}
            <Link href="/registro" className="font-medium text-primary underline-offset-4 hover:underline">
              Registrate
            </Link>
          </p>
        </CardContent>
      </Card>
      <DemoAccounts />
    </div>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />o<span className="h-px flex-1 bg-border" />
    </div>
  );
}
