import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader, SectionSkeleton } from "@/components/layout/page-header";
import { NewRestaurantForm } from "@/components/panel-ops/new-restaurant-form";
import { requireUser } from "@/modules/auth/session";
import { getDefaultCommissionBps, listZones } from "@/modules/admin/queries";

export const metadata: Metadata = { title: "Nuevo restaurante" };

export default function NewRestaurantPage() {
  return (
    <>
      <PageHeader title="Nuevo restaurante" description="Arranca en configuración: no es visible para clientes hasta que lo actives." />
      <Suspense fallback={<SectionSkeleton />}>
        <NewRestaurantFormSection />
      </Suspense>
    </>
  );
}

async function NewRestaurantFormSection() {
  await requireUser(["SUPER_ADMIN"]);
  const [zones, defaultCommissionBps] = await Promise.all([listZones(), getDefaultCommissionBps()]);
  return <NewRestaurantForm zones={zones} defaultCommissionBps={defaultCommissionBps} />;
}
