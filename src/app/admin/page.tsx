import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle, Store } from "lucide-react";
import { PageHeader, SectionSkeleton } from "@/components/layout/page-header";
import { RestaurantStatusBadge } from "@/components/panel-ops/restaurant-status-badge";
import { PeriodTabs } from "@/components/panel-ops/period-tabs";
import { StatTile } from "@/components/panel-ops/stat-tile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/modules/auth/session";
import { parsePeriod } from "@/modules/metrics/calc";
import { getPlatformMetrics } from "@/modules/metrics/platform-queries";
import { formatBps, formatGs } from "@/modules/shared/money";

export const metadata: Metadata = { title: "Administración" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function AdminPage({ searchParams }: Props) {
  return (
    <>
      <PageHeader title="Administración de la plataforma" description="Métricas globales, restaurantes y reclamos." />
      <Suspense fallback={<SectionSkeleton />}>
        <PlatformOverview searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function PlatformOverview({ searchParams }: Props) {
  await requireUser(["SUPER_ADMIN"]);
  const period = parsePeriod((await searchParams).periodo);
  const m = await getPlatformMetrics(period);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link href="/admin/restaurantes">
            <Store />
            Restaurantes
          </Link>
        </Button>
        <Button asChild size="sm" variant={m.openClaims > 0 ? "destructive" : "outline"}>
          <Link href="/admin/reclamos">
            <AlertTriangle />
            Reclamos {m.openClaims > 0 ? `(${m.openClaims})` : ""}
          </Link>
        </Button>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Situación general">
        <StatTile label="Restaurantes" value={m.restaurantsTotal} detail={`${m.restaurantCounts.get("ACTIVE") ?? 0} activos`} />
        <StatTile label="Clientes" value={m.customers} detail={`+${m.newCustomers} en el período`} />
        <StatTile label="Saldo en billeteras" value={formatGs(m.walletLiability)} detail="Pasivo total con clientes" />
        <StatTile label="Reclamos abiertos" value={m.openClaims} detail="Esperando resolución" />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Período</h2>
        <PeriodTabs basePath="/admin" period={period} />
      </div>
      <p className="-mt-3 text-sm text-muted-foreground">Pedidos pagados en los últimos {period} días (por fecha de pago).</p>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Métricas del período">
        <StatTile label="GMV" value={formatGs(m.gmv)} detail={`${m.paidOrders} pedidos pagos`} />
        <StatTile label="Comisiones" value={formatGs(m.commissions)} detail="Ingreso de la plataforma" />
        <StatTile label="Reembolsos a billetera" value={formatGs(m.walletRefunds)} detail="Cancelaciones y reclamos" />
        <StatTile
          label="Cancelados por restaurantes"
          value={formatBps(m.cancelRateBps)}
          detail={`${m.cancelledByRestaurant} de ${m.paidOrders} pagos`}
        />
      </section>
      {m.penalties > 0 || m.goodwill > 0 ? (
        <p className="text-sm text-muted-foreground">
          Penalidades descontadas a restaurantes: {formatGs(m.penalties)}. Gasto de atención al cliente (goodwill): {formatGs(m.goodwill)}.
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Restaurantes</CardTitle>
          <CardDescription>GMV y cancelaciones del período.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {m.perRestaurant.map((r) => (
            <Link
              key={r.id}
              href={`/admin/restaurantes/${r.id}`}
              className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 border-t pt-2 text-sm first:border-t-0 first:pt-0 hover:bg-muted/40"
            >
              <p className="font-medium">{r.name}</p>
              <RestaurantStatusBadge status={r.status} />
              <p className="text-muted-foreground">
                {r.paid} pedido{r.paid === 1 ? "" : "s"} · {formatGs(r.gmv)}
              </p>
              <p className="text-right text-muted-foreground">Cancelación {formatBps(r.cancelRateBps)}</p>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
