import type { NextRequest } from "next/server";
import { requireRestaurantBySlug } from "@/modules/auth/session";
import { renderProductionPdf } from "@/modules/production/pdf";
import { getProductionData } from "@/modules/production/queries";
import { isDateKey, todayKey } from "@/modules/shared/time";

// PDF de la lista de producción (generado en el servidor, sin binarios ni red externa).
export async function GET(request: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  // Autoriza acá también: un route handler es un punto de entrada propio.
  const { restaurant } = await requireRestaurantBySlug(slug);
  const raw = request.nextUrl.searchParams.get("fecha");
  if (raw !== null && !isDateKey(raw)) return new Response("Fecha inválida", { status: 400 });
  const date = raw ?? todayKey();

  const data = await getProductionData(restaurant, date, new Date());
  const bytes = await renderProductionPdf({ restaurantName: restaurant.name, ...data });
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="produccion-${restaurant.slug}-${date}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
