import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MapPin, Phone, ShoppingBag } from "lucide-react";
import { PageHeader, SectionSkeleton } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { DateNav } from "@/components/panel-ops/date-nav";
import { AllergyFlag, NoteFlag } from "@/components/panel-ops/flags";
import { OrderActions } from "@/components/panel-ops/order-actions";
import { OrderStatusBadge } from "@/components/panel-ops/order-status-badge";
import type { OrderStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { requireRestaurantBySlug } from "@/modules/auth/session";
import { canAdvanceOnDate } from "@/modules/orders/restaurant-transitions";
import { deliveryAddressText, getDayOrders, type DayOrder } from "@/modules/orders/restaurant-queries";
import { formatDateLong, FULFILLMENT_LABEL } from "@/modules/production/format";
import { ORDER_STATUS_LABEL } from "@/modules/shared/labels";
import { formatGs } from "@/modules/shared/money";
import { formatMinute, isDateKey, todayKey } from "@/modules/shared/time";

export const metadata: Metadata = { title: "Pedidos del día" };

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function OrdersOfTheDayPage({ params, searchParams }: Props) {
  return (
    <>
      <PageHeader title="Pedidos del día" description="Marcá cada pedido en preparación, listo y entregado. Si tenés que cancelar, el cliente recibe el reembolso al instante." />
      <Suspense fallback={<SectionSkeleton />}>
        <DayOrders params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const SUMMARY_ORDER: OrderStatus[] = ["CONFIRMED", "IN_PREPARATION", "READY", "DELIVERED", "CANCELLED_BY_RESTAURANT", "CANCELLED_BY_CUSTOMER"];

async function DayOrders({ params, searchParams }: Props) {
  const { slug } = await params;
  const { restaurant } = await requireRestaurantBySlug(slug);
  const raw = (await searchParams).fecha;
  const today = todayKey();
  const date = typeof raw === "string" && isDateKey(raw) ? raw : today;
  const day = await getDayOrders(restaurant.id, date);
  const canPrepare = canAdvanceOnDate(date, today);
  const basePath = `/panel/${restaurant.slug}/pedidos`;

  return (
    <div className="grid gap-4">
      <DateNav basePath={basePath} date={date} today={today} />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold first-letter:uppercase">{formatDateLong(date)}</h2>
        <Link href={`/panel/${restaurant.slug}/produccion?fecha=${date}`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Ver lista de producción
        </Link>
      </div>
      {day.total > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Resumen por estado">
          {SUMMARY_ORDER.filter((s) => day.counts.get(s)).map((s) => (
            <li key={s} className="rounded-lg border bg-card px-3 py-1.5 text-sm">
              {ORDER_STATUS_LABEL[s]} <span className="font-semibold tabular-nums">{day.counts.get(s)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">No hay pedidos para este día.</p>
      )}
      {!canPrepare && day.total > 0 ? (
        <p className="text-sm text-muted-foreground">Es un día futuro: los estados de cocina se habilitan ese día. Igual podés cancelar si hace falta.</p>
      ) : null}

      {day.slots.map((slot) => {
        const active = slot.orders.filter((o) => !o.status.startsWith("CANCELLED")).length;
        return (
          <section key={`${slot.startMinute}-${slot.endMinute}`} className="grid gap-2" aria-label={`Franja ${formatMinute(slot.startMinute)}`}>
            <h3 className="border-b pb-1 font-semibold">
              <span className="tabular-nums">
                {formatMinute(slot.startMinute)}–{formatMinute(slot.endMinute)}
              </span>{" "}
              <span className="font-normal text-muted-foreground">· {active} pedidos</span>
            </h3>
            <ul className="grid gap-3 md:grid-cols-2">
              {slot.orders.map((o) => (
                <OrderCard key={o.id} order={o} slug={restaurant.slug} canPrepare={canPrepare} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function OrderCard({ order: o, slug, canPrepare }: { order: DayOrder; slug: string; canPrepare: boolean }) {
  const cancelled = o.status === "CANCELLED_BY_RESTAURANT" || o.status === "CANCELLED_BY_CUSTOMER";
  const address = o.fulfillment === "DELIVERY" ? deliveryAddressText(o.deliveryAddress) : null;
  return (
    <li
      className={cn("grid gap-3 rounded-xl border bg-card p-4 shadow-sm", cancelled && "bg-muted/40 opacity-80 shadow-none")}
      data-order-code={o.code}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-base font-semibold">{o.code}</p>
          <p className="truncate font-medium">{o.customer.name ?? o.customer.email}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <OrderStatusBadge status={o.status} />
          {o.kind === "PLAN_DAY" ? <Badge variant="secondary">Plan mensual</Badge> : null}
        </div>
      </div>

      <ul className="grid gap-1 text-sm">
        {o.items.map((it) => (
          <li key={it.id} className="grid gap-1">
            <p>
              <span className="font-semibold tabular-nums">{it.quantity}×</span> {it.dishName}
              {it.modifierSummary ? <span className="text-muted-foreground"> — {it.modifierSummary}</span> : null}
            </p>
            <NoteFlag text={it.notes} />
          </li>
        ))}
      </ul>
      <AllergyFlag allergens={o.allergens} other={o.allergyOther} />

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          {o.fulfillment === "DELIVERY" ? <MapPin className="size-4" /> : <ShoppingBag className="size-4" />}
          {FULFILLMENT_LABEL[o.fulfillment]}
          {address ? `: ${address}` : ""}
        </span>
        {o.customer.phone ? (
          <a href={`tel:${o.customer.phone}`} className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
            <Phone className="size-4" />
            {o.customer.phone}
          </a>
        ) : null}
        <span className="tabular-nums">{formatGs(o.total)}</span>
      </div>

      {cancelled ? (
        o.cancelReason ? <p className="text-sm">Motivo: {o.cancelReason}</p> : null
      ) : o.status !== "DELIVERED" ? (
        <OrderActions
          slug={slug}
          orderId={o.id}
          code={o.code}
          status={o.status}
          total={o.total}
          isPlanDay={o.kind === "PLAN_DAY"}
          canPrepare={canPrepare}
        />
      ) : null}
    </li>
  );
}
