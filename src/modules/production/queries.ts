import "server-only";
import { db } from "@/lib/db";
import { PAID_ACTIVE_STATUSES } from "@/modules/orders/statuses";
import { cutoffInstant, dateKeyToDb, type DateKey } from "@/modules/shared/time";
import { buildProductionList, productionListState, type ProductionOrderInput } from "./grouping";

// Acceso a datos de la lista de producción. Quien llama ya autorizó el acceso al restaurante.

export async function loadProductionOrders(restaurantId: string, date: DateKey): Promise<ProductionOrderInput[]> {
  const orders = await db.order.findMany({
    where: {
      restaurantId,
      serviceDate: dateKeyToDb(date),
      // Cuentan solo los pagos (incluye días de plan mensual: son pedidos PLAN_DAY normales).
      status: { in: [...PAID_ACTIVE_STATUSES] },
    },
    orderBy: [{ slotStartMinute: "asc" }, { code: "asc" }],
    select: {
      id: true,
      code: true,
      slotStartMinute: true,
      slotEndMinute: true,
      fulfillment: true,
      kind: true,
      allergens: true,
      allergyOther: true,
      customer: { select: { name: true, email: true } },
      items: {
        orderBy: { id: "asc" },
        select: { dishId: true, dishName: true, quantity: true, modifierKey: true, modifierSummary: true, notes: true },
      },
    },
  });
  return orders.map((o) => ({
    id: o.id,
    code: o.code,
    customerName: o.customer.name ?? o.customer.email,
    slotStartMinute: o.slotStartMinute,
    slotEndMinute: o.slotEndMinute,
    fulfillment: o.fulfillment,
    kind: o.kind,
    allergens: o.allergens,
    allergyOther: o.allergyOther,
    items: o.items,
  }));
}

export type ProductionRestaurant = { id: string; name: string; cutoffDaysBefore: number; cutoffMinute: number };

export async function getProductionData(restaurant: ProductionRestaurant, date: DateKey, now: Date = new Date()) {
  const orders = await loadProductionOrders(restaurant.id, date);
  const cutoffAt = cutoffInstant(date, restaurant.cutoffDaysBefore, restaurant.cutoffMinute);
  return {
    date,
    cutoffAt,
    state: productionListState(cutoffAt, now),
    generatedAt: now,
    list: buildProductionList(orders),
  };
}

export type ProductionData = Awaited<ReturnType<typeof getProductionData>>;
