import "server-only";
import { db } from "@/lib/db";

/** Todo lo que muestra /panel/[slug]/configuracion. */
export async function getRestaurantConfig(restaurantId: string) {
  const [restaurant, zones] = await Promise.all([
    db.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      include: {
        zone: true,
        deliveryZones: true,
        openingHours: { orderBy: [{ weekday: "asc" }, { opensMinute: "asc" }] },
        discountTiers: { orderBy: { minHoursBefore: "asc" } },
        planConfig: true,
      },
    }),
    db.zone.findMany({ orderBy: { name: "asc" } }),
  ]);
  return { restaurant, zones };
}

export type RestaurantConfig = Awaited<ReturnType<typeof getRestaurantConfig>>;
