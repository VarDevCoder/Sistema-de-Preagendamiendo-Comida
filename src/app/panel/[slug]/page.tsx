import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ClipboardList, ListChecks } from "lucide-react";
import { PageHeader, SectionSkeleton } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart } from "@/components/panel-ops/bar-chart";
import { PeriodTabs } from "@/components/panel-ops/period-tabs";
import { StatTile } from "@/components/panel-ops/stat-tile";
import { requireRestaurantBySlug } from "@/modules/auth/session";
import { parsePeriod } from "@/modules/metrics/calc";
import { getRestaurantDashboard, type RestaurantDashboard } from "@/modules/metrics/restaurant-queries";
import { formatDateShort } from "@/modules/production/format";
import { formatBps, formatGs } from "@/modules/shared/money";
import { addDays } from "@/modules/shared/time";

export const metadata: Metadata = { title: "Dashboard" };

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function RestaurantDashboardPage({ params, searchParams }: Props) {
  return (
    <>
      <PageHeader title="Dashboard" description="Lo que ya está vendido y cobrado, para planificar compras y producción." />
      <Suspense fallback={<SectionSkeleton />}>
        <Dashboard params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Dashboard({ params, searchParams }: Props) {
  const { slug } = await params;
  const { restaurant } = await requireRestaurantBySlug(slug);
  const period = parsePeriod((await searchParams).periodo);
  const d = await getRestaurantDashboard(restaurant.id, period, new Date());
  const base = `/panel/${restaurant.slug}`;
  const nextWeekTotal = d.upcoming.reduce((a, u) => a + u.value, 0);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link href={`${base}/pedidos`}>
            <ListChecks />
            Pedidos de hoy
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={`${base}/produccion?fecha=${addDays(d.today, 1)}`}>
            <ClipboardList />
            Producción de mañana
          </Link>
        </Button>
      </div>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Situación actual">
        <StatTile
          label="Cobrado por adelantado"
          value={formatGs(d.advance.amount)}
          detail={`${d.advance.orders} pedidos pagos de hoy en adelante, todavía sin entregar`}
        />
        <StatTile label="Pedidos próximos 7 días" value={nextWeekTotal} detail="Confirmados y pagos" />
        <StatTile label="Suscriptores al plan mensual" value={d.subscribers} detail="Con plan activo" />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Pedidos confirmados por día</CardTitle>
          <CardDescription>Próximos 7 días, desde hoy.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <BarChart
            label="Pedidos confirmados por día en los próximos 7 días"
            data={d.upcoming.map((u) => ({ key: u.date, label: formatDateShort(u.date), value: u.value }))}
          />
          <Forecast d={d} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Período</h2>
        <PeriodTabs basePath={base} period={period} />
      </div>
      <p className="-mt-3 text-sm text-muted-foreground">Pedidos pagados en los últimos {period} días (por fecha de pago).</p>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Métricas del período">
        <StatTile label="Ingresos cobrados" value={formatGs(d.periodTotals.revenue)} detail={`${d.periodTotals.active} pedidos vigentes`} />
        <StatTile
          label="Ahorro de tus clientes"
          value={formatGs(d.periodTotals.savings)}
          detail="Descuentos por anticipación y plan"
        />
        <StatTile
          label="Tasa de cancelación"
          value={formatBps(d.periodTotals.restaurantCancelRateBps)}
          detail={`${d.periodTotals.cancelledByRestaurant} cancelados por vos de ${d.periodTotals.paid} pagos`}
        />
        <StatTile
          label="Cancelados por clientes"
          value={d.periodTotals.cancelledByCustomer}
          detail="Antes de la hora de corte"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Platos más pedidos</CardTitle>
            <CardDescription>Unidades en el período.</CardDescription>
          </CardHeader>
          <CardContent>
            {d.topDishes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin pedidos en el período.</p>
            ) : (
              <ol className="grid gap-2">
                {d.topDishes.map((t, i) => {
                  const pct = (t.value / d.topDishes[0].value) * 100;
                  return (
                    <li key={t.id} className="grid gap-1 text-sm">
                      <div className="flex justify-between gap-2">
                        <span>
                          <span className="text-muted-foreground tabular-nums">{i + 1}.</span> {t.label}
                        </span>
                        <span className="font-semibold tabular-nums">{t.value}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted" aria-hidden>
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Modificadores más elegidos</CardTitle>
            <CardDescription>Por plato: qué % de las unidades llevó cada opción.</CardDescription>
          </CardHeader>
          <CardContent>
            {d.topModifiers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin modificadores elegidos en el período.</p>
            ) : (
              <div className="grid gap-3">
                {d.topModifiers.map((m) => (
                  <div key={m.dishId} className="grid gap-1 text-sm">
                    <p className="font-medium">
                      {m.dishName} <span className="font-normal text-muted-foreground">· {m.units} u.</span>
                    </p>
                    <ul className="grid gap-0.5">
                      {m.options.map((o) => (
                        <li key={o.optionId} className="flex justify-between gap-2 text-muted-foreground">
                          <span>{o.label}</span>
                          <span className="text-foreground tabular-nums">
                            {o.quantity} · {formatBps(o.shareBps)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Previsión: unidades ya pagas por plato para los próximos días (tabla, también sirve de vista accesible del gráfico). */
function Forecast({ d }: { d: RestaurantDashboard }) {
  if (d.forecast.rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay pedidos para los próximos días.</p>;
  }
  return (
    <div className="grid gap-1">
      <p className="text-sm font-medium">Previsión por plato (unidades ya pagas)</p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="sticky left-0 bg-card px-2 py-1.5 text-left font-medium">Plato</th>
              {d.forecast.dates.map((date) => (
                <th key={date} className="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                  {formatDateShort(date)}
                </th>
              ))}
              <th className="px-2 py-1.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {d.forecast.rows.map((r) => (
              <tr key={r.dishId} className="border-b last:border-0">
                <td className="sticky left-0 bg-card px-2 py-1.5 whitespace-nowrap">{r.dishName}</td>
                {r.byDate.map((q, i) => (
                  <td key={i} className={`px-2 py-1.5 text-right tabular-nums ${q === 0 ? "text-muted-foreground" : ""}`}>
                    {q}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{r.total}</td>
              </tr>
            ))}
            <tr className="border-t bg-muted/40">
              <td className="sticky left-0 bg-muted px-2 py-1.5 font-medium">Pedidos</td>
              {d.upcoming.map((u) => (
                <td key={u.date} className="px-2 py-1.5 text-right font-medium tabular-nums">
                  {u.value}
                </td>
              ))}
              <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{d.upcoming.reduce((a, u) => a + u.value, 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
