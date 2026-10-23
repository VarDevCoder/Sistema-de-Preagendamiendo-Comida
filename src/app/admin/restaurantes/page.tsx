import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { PageHeader, SectionSkeleton } from "@/components/layout/page-header";
import { RestaurantStatusBadge } from "@/components/panel-ops/restaurant-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/modules/auth/session";
import { listRestaurantsForAdmin } from "@/modules/admin/queries";
import { formatBps } from "@/modules/shared/money";

export const metadata: Metadata = { title: "Restaurantes" };

export default function AdminRestaurantsPage() {
  return (
    <>
      <PageHeader title="Restaurantes" description="Alta, baja, suspensión y condiciones comerciales." />
      <Suspense fallback={<SectionSkeleton />}>
        <RestaurantsList />
      </Suspense>
    </>
  );
}

async function RestaurantsList() {
  await requireUser(["SUPER_ADMIN"]);
  const restaurants = await listRestaurantsForAdmin();

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button asChild size="sm">
          <Link href="/admin/restaurantes/nuevo">
            <Plus />
            Nuevo restaurante
          </Link>
        </Button>
      </div>

      {restaurants.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">Todavía no hay restaurantes.</CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {restaurants.map((r) => (
            <Link key={r.id} href={`/admin/restaurantes/${r.id}`}>
              <Card className="transition-colors hover:bg-muted/40">
                <CardContent className="grid gap-1.5 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{r.name}</p>
                    <RestaurantStatusBadge status={r.status} />
                  </div>
                  <p className="text-sm text-muted-foreground">{r.zone.name}</p>
                  <p className="text-sm text-muted-foreground">
                    Comisión {formatBps(r.commissionBps)} · {r.members.map((m) => m.user.email).join(", ") || "Sin administrador"}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
