import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader, SectionSkeleton } from "@/components/layout/page-header";
import { DateNav } from "@/components/panel-ops/date-nav";
import { ProductionView } from "@/components/panel-ops/production-view";
import { requireRestaurantBySlug } from "@/modules/auth/session";
import { getProductionData } from "@/modules/production/queries";
import { isDateKey, todayKey } from "@/modules/shared/time";

export const metadata: Metadata = { title: "Lista de producción" };

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function ProductionPage({ params, searchParams }: Props) {
  return (
    <>
      <div data-print-hide>
        <PageHeader title="Lista de producción" description="Cantidades por plato y combinación, con el detalle de cada pedido." />
      </div>
      <Suspense fallback={<SectionSkeleton />}>
        <Production params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Production({ params, searchParams }: Props) {
  const { slug } = await params;
  const { restaurant } = await requireRestaurantBySlug(slug);
  const raw = (await searchParams).fecha;
  const today = todayKey();
  const date = typeof raw === "string" && isDateKey(raw) ? raw : today;
  const data = await getProductionData(restaurant, date, new Date());
  const basePath = `/panel/${restaurant.slug}/produccion`;

  return (
    <div className="grid gap-4">
      <DateNav basePath={basePath} date={date} today={today} />
      <ProductionView data={data} restaurantName={restaurant.name} pdfHref={`${basePath}/pdf?fecha=${date}`} />
    </div>
  );
}
