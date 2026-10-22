import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader, SectionSkeleton } from "@/components/layout/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { getManagedRestaurants, requireUser } from "@/modules/auth/session";
import { RESTAURANT_STATUS_LABEL } from "@/modules/shared/labels";
import { addDays, dateKeyToDb, todayKey } from "@/modules/shared/time";

export const metadata: Metadata = { title: "Panel del restaurante" };

export default function RestaurantPanelPage() {
  return (
    <>
      <PageHeader title="Panel del restaurante" description="Menú, cupos, producción y métricas (Fases 3 y 7)." />
      <Suspense fallback={<SectionSkeleton />}>
        <ManagedRestaurants />
      </Suspense>
    </>
  );
}

async function ManagedRestaurants() {
  const user = await requireUser(["RESTAURANT_ADMIN", "SUPER_ADMIN"]);
  const restaurants = await getManagedRestaurants(user);
  if (restaurants.length === 0) {
    return <p className="text-muted-foreground">Todavía no tenés restaurantes asignados.</p>;
  }
  const today = todayKey();
  const counts = await db.order.groupBy({
    by: ["restaurantId"],
    where: {
      restaurantId: { in: restaurants.map((r) => r.id) },
      serviceDate: { gte: dateKeyToDb(today), lte: dateKeyToDb(addDays(today, 6)) },
      status: { in: ["CONFIRMED", "IN_PREPARATION", "READY", "DELIVERED"] },
    },
    _count: { _all: true },
  });
  const byId = new Map(counts.map((c) => [c.restaurantId, c._count._all]));

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {restaurants.map((r) => (
        <Card key={r.id}>
          <CardHeader>
            <CardTitle>{r.name}</CardTitle>
            <CardDescription>
              {RESTAURANT_STATUS_LABEL[r.status]} · {byId.get(r.id) ?? 0} pedidos confirmados en los próximos 7 días
            </CardDescription>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
