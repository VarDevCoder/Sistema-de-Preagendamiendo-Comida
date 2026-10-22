import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader, SectionSkeleton } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireUser } from "@/modules/auth/session";
import { RESTAURANT_STATUS_LABEL } from "@/modules/shared/labels";
import { formatBps } from "@/modules/shared/money";

export const metadata: Metadata = { title: "Administración" };

export default function AdminPage() {
  return (
    <>
      <PageHeader title="Administración de la plataforma" description="Restaurantes, comisiones y métricas globales (Fase 7)." />
      <Suspense fallback={<SectionSkeleton />}>
        <PlatformOverview />
      </Suspense>
    </>
  );
}

async function PlatformOverview() {
  await requireUser(["SUPER_ADMIN"]);
  const [restaurants, customers, orders] = await Promise.all([
    db.restaurant.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        status: true,
        commissionBps: true,
        restaurantCancelRefundsCommission: true,
        restaurantCancelPenaltyBps: true,
      },
    }),
    db.user.count({ where: { role: "CUSTOMER" } }),
    db.order.count({ where: { status: { notIn: ["EXPIRED", "PAYMENT_FAILED", "PENDING_PAYMENT"] } } }),
  ]);

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Restaurantes" value={restaurants.length} />
        <Stat label="Clientes" value={customers} />
        <Stat label="Pedidos" value={orders} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Restaurantes</CardTitle>
          <CardDescription>Comisión y política si el restaurante cancela.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {restaurants.map((r) => (
            <div key={r.id} className="grid grid-cols-[1fr_auto] gap-x-3 border-t pt-2 text-sm first:border-t-0 first:pt-0">
              <p className="font-medium">{r.name}</p>
              <p className="text-right text-muted-foreground">Comisión {formatBps(r.commissionBps)}</p>
              <p className="text-muted-foreground">{RESTAURANT_STATUS_LABEL[r.status]}</p>
              <p className="text-right text-muted-foreground">
                {r.restaurantCancelRefundsCommission ? "Devuelve comisión" : "Absorbe comisión"}
                {r.restaurantCancelPenaltyBps > 0 ? ` + ${formatBps(r.restaurantCancelPenaltyBps)}` : ""}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="gap-1 py-4">
      <CardHeader className="px-4">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
