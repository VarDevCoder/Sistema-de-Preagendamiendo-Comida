import { Suspense } from "react";
import { PanelHeader, PanelHeaderSkeleton } from "@/components/panel/panel-header";

// El slug es un dato de la request: el encabezado (que autoriza y lee la base)
// va dentro de <Suspense>; el resto del layout se prerenderiza.
export default function RestaurantPanelLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  return (
    <>
      <Suspense fallback={<PanelHeaderSkeleton />}>{params.then(({ slug }) => <PanelHeader slug={slug} />)}</Suspense>
      {children}
    </>
  );
}
