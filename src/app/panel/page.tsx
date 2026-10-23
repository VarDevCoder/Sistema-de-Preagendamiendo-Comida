import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { PageHeader, SectionSkeleton } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { getManagedRestaurants, requireUser } from "@/modules/auth/session";
import { RESTAURANT_STATUS_LABEL } from "@/modules/shared/labels";
import { addDays, dateKeyToDb, todayKey } from "@/modules/shared/time";

export const metadata: Metadata = { title: "Panel del restaurante" };

export default function RestaurantPanelPage() {
  return (
    <>
      <PageHeader title="Panel del restaurante" description="Elegí el local que querés administrar." />
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
  // Con un solo local no hay nada que elegir: directo a su panel.
  if (restaurants.length === 1) redirect(`/panel/${restaurants[0].slug}`);

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
    <ul className="grid gap-3 sm:grid-cols-2">
      {restaurants.map((r) => (
        <li key={r.id}>
          <Link
            href={`/panel/${r.slug}`}
            className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:bg-secondary"
          >
            <span className="grid gap-1">
              <span className="font-semibold">{r.name}</span>
              <span className="text-sm text-muted-foreground">
                {byId.get(r.id) ?? 0} pedidos confirmados en los próximos 7 días
              </span>
              {r.status !== "ACTIVE" ? <Badge variant="warning">{RESTAURANT_STATUS_LABEL[r.status]}</Badge> : null}
            </span>
            <ChevronRight className="size-5 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
