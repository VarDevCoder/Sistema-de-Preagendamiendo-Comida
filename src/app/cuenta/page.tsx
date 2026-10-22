import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader, SectionSkeleton } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireUser } from "@/modules/auth/session";
import { ALLERGEN_LABEL } from "@/modules/shared/labels";
import { formatGs } from "@/modules/shared/money";
import { dateKeyToDb, todayKey } from "@/modules/shared/time";
import { getWalletBalance } from "@/modules/wallet/ledger";

export const metadata: Metadata = { title: "Mi cuenta" };

export default function AccountPage() {
  return (
    <>
      <PageHeader title="Mi cuenta" />
      <Suspense fallback={<SectionSkeleton />}>
        <AccountSummary />
      </Suspense>
    </>
  );
}

async function AccountSummary() {
  const user = await requireUser();
  const [profile, balance, upcoming, preferences] = await Promise.all([
    db.customerProfile.findUnique({ where: { userId: user.id } }),
    getWalletBalance(user.id),
    db.order.count({
      where: {
        customerId: user.id,
        serviceDate: { gte: dateKeyToDb(todayKey()) },
        status: { in: ["CONFIRMED", "IN_PREPARATION", "READY"] },
      },
    }),
    db.customerPreference.count({ where: { userId: user.id } }),
  ]);
  const allergens = profile?.allergens ?? [];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader>
          <CardDescription>Saldo en billetera</CardDescription>
          <CardTitle className="text-2xl">{formatGs(balance)}</CardTitle>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardDescription>Próximos pedidos confirmados</CardDescription>
          <CardTitle className="text-2xl">{upcoming}</CardTitle>
        </CardHeader>
      </Card>
      <Card className="sm:col-span-2">
        <CardHeader>
          <CardTitle>{user.name ?? user.email}</CardTitle>
          <CardDescription>{user.email}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <p>
            <span className="text-muted-foreground">Alergias: </span>
            {allergens.length
              ? allergens.map((a) => (a === "OTHER" ? profile?.allergyOther : ALLERGEN_LABEL[a])).join(", ")
              : "ninguna registrada"}
          </p>
          <p>
            <span className="text-muted-foreground">Preferencias guardadas: </span>
            {preferences}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
