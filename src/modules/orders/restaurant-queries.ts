import "server-only";
import { db } from "@/lib/db";
import type { OrderStatus } from "@/generated/prisma/enums";
import { dateKeyToDb, type DateKey } from "@/modules/shared/time";

// Pedidos de un día para la pantalla de gestión del restaurante, agrupados por franja.

const VISIBLE: OrderStatus[] = ["CONFIRMED", "IN_PREPARATION", "READY", "DELIVERED", "CANCELLED_BY_RESTAURANT", "CANCELLED_BY_CUSTOMER"];

export async function getDayOrders(restaurantId: string, date: DateKey) {
  const orders = await db.order.findMany({
    where: { restaurantId, serviceDate: dateKeyToDb(date), status: { in: VISIBLE } },
    orderBy: [{ slotStartMinute: "asc" }, { code: "asc" }],
    select: {
      id: true,
      code: true,
      kind: true,
      status: true,
      slotStartMinute: true,
      slotEndMinute: true,
      fulfillment: true,
      deliveryAddress: true,
      total: true,
      allergens: true,
      allergyOther: true,
      cancelReason: true,
      customer: { select: { name: true, email: true, phone: true } },
      items: {
        orderBy: { id: "asc" },
        select: { id: true, dishName: true, quantity: true, modifierSummary: true, notes: true },
      },
    },
  });

  type Row = (typeof orders)[number];
  const slots = new Map<string, { startMinute: number; endMinute: number; orders: Row[] }>();
  for (const o of orders) {
    const key = `${o.slotStartMinute}-${o.slotEndMinute}`;
    const s = slots.get(key) ?? { startMinute: o.slotStartMinute, endMinute: o.slotEndMinute, orders: [] };
    s.orders.push(o);
    slots.set(key, s);
  }
  const counts = new Map<OrderStatus, number>();
  for (const o of orders) counts.set(o.status, (counts.get(o.status) ?? 0) + 1);

  return {
    slots: [...slots.values()].sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute),
    counts,
    total: orders.length,
  };
}

export type DayOrder = Awaited<ReturnType<typeof getDayOrders>>["slots"][number]["orders"][number];

/** Texto de la dirección de entrega guardada como snapshot JSON. */
export function deliveryAddressText(addr: unknown): string | null {
  if (!addr || typeof addr !== "object") return null;
  const a = addr as Record<string, unknown>;
  const parts = [a.street, a.reference, a.zone].filter((v): v is string => typeof v === "string" && v.trim() !== "");
  return parts.length ? parts.join(", ") : null;
}
