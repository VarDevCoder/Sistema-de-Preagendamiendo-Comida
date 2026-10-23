import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { getPanelRestaurant } from "@/modules/restaurants/access";
import { RESTAURANT_STATUS_LABEL } from "@/modules/shared/labels";
import { PanelNav } from "./panel-nav";

/** Encabezado del panel: nombre del local + navegación fija debajo del header del sitio. */
export async function PanelHeader({ slug }: { slug: string }) {
  const { user, restaurant } = await getPanelRestaurant(slug);
  const canSwitch =
    user.role === "SUPER_ADMIN" || (await db.restaurantMember.count({ where: { userId: user.id } })) > 1;
  return (
    <>
      <div className="flex items-center justify-between gap-3 pt-4">
        <div className="grid min-w-0 gap-0.5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Panel del restaurante</p>
          <p className="truncate text-lg font-semibold">{restaurant.name}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {restaurant.status !== "ACTIVE" ? <Badge variant="warning">{RESTAURANT_STATUS_LABEL[restaurant.status]}</Badge> : null}
          {canSwitch ? (
            <Link href="/panel" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              Cambiar
            </Link>
          ) : null}
        </div>
      </div>
      <div className="sticky top-14 z-20 -mx-4 border-b bg-background/95 px-4 pt-3 pb-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <PanelNav slug={restaurant.slug} />
      </div>
    </>
  );
}

export function PanelHeaderSkeleton() {
  return (
    <div className="grid gap-3 pt-4 pb-2" aria-busy="true">
      <div className="h-11 w-56 animate-pulse rounded-md bg-muted" />
      <div className="flex gap-1.5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-9 w-24 animate-pulse rounded-full bg-muted" />
        ))}
      </div>
    </div>
  );
}
