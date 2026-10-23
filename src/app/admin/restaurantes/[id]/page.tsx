import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader, SectionSkeleton } from "@/components/layout/page-header";
import { AddRestaurantAdminForm } from "@/components/panel-ops/add-restaurant-admin-form";
import { CommercialTermsForm } from "@/components/panel-ops/commercial-terms-form";
import { RestaurantStatusBadge } from "@/components/panel-ops/restaurant-status-badge";
import { RestaurantStatusForm } from "@/components/panel-ops/restaurant-status-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { requireUser } from "@/modules/auth/session";
import { getRestaurantForAdmin } from "@/modules/admin/queries";
import { formatInstant } from "@/modules/production/format";

export const metadata: Metadata = { title: "Restaurante" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function AdminRestaurantPage({ params, searchParams }: Props) {
  return (
    <>
      <PageHeader title="Restaurante" description="Condiciones comerciales, estado y administradores." />
      <Suspense fallback={<SectionSkeleton />}>
        <RestaurantDetail params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function RestaurantDetail({ params, searchParams }: Props) {
  await requireUser(["SUPER_ADMIN"]);
  const { id } = await params;
  const created = (await searchParams).creado === "1";
  const data = await getRestaurantForAdmin(id);
  if (!data) notFound();
  const { restaurant, pendingPaid, audit } = data;

  return (
    <div className="grid gap-5">
      {created ? (
        <Alert>
          <AlertDescription>Restaurante creado. Está en configuración: actívalo cuando esté listo para recibir pedidos.</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>{restaurant.name}</CardTitle>
            <RestaurantStatusBadge status={restaurant.status} />
          </div>
          <CardDescription>
            {restaurant.zone.name} · {restaurant.addressLine}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            {pendingPaid} pedido{pendingPaid === 1 ? "" : "s"} ya pago{pendingPaid === 1 ? "" : "s"} para hoy o días futuros.
          </p>
          <RestaurantStatusForm restaurantId={restaurant.id} status={restaurant.status} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Condiciones comerciales</CardTitle>
          <CardDescription>La comisión nueva aplica a pedidos futuros. La política de cancelación aplica desde ahora.</CardDescription>
        </CardHeader>
        <CardContent>
          <CommercialTermsForm
            restaurantId={restaurant.id}
            commissionBps={restaurant.commissionBps}
            refundsCommission={restaurant.restaurantCancelRefundsCommission}
            penaltyBps={restaurant.restaurantCancelPenaltyBps}
            macrosRequired={restaurant.macrosRequired}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Administradores</CardTitle>
          <CardDescription>Quiénes gestionan este restaurante.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {restaurant.members.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin administradores.</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {restaurant.members.map((m) => (
                <li key={m.userId} className="flex items-center justify-between gap-2">
                  <span>
                    {m.user.name ?? m.user.email} <span className="text-muted-foreground">· {m.user.email}</span>
                  </span>
                  {!m.user.isActive ? <span className="text-xs text-destructive">Inactivo</span> : null}
                </li>
              ))}
            </ul>
          )}
          <Separator />
          <AddRestaurantAdminForm restaurantId={restaurant.id} />
        </CardContent>
      </Card>

      {audit.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Historial</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {audit.map((a) => (
                <li key={a.id} className="grid gap-0.5 border-t pt-2 first:border-t-0 first:pt-0">
                  <div className="flex justify-between gap-2 text-muted-foreground">
                    <span>{a.actor?.name ?? a.actor?.email ?? "Sistema"}</span>
                    <span>{formatInstant(a.createdAt)}</span>
                  </div>
                  <p>{a.action}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
