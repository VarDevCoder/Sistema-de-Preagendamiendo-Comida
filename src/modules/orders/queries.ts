import "server-only";
import { db } from "@/lib/db";

// Lecturas de pedidos del cliente (siempre filtradas por su id).

export async function listCustomerOrders(userId: string) {
  return db.order.findMany({
    where: { customerId: userId },
    orderBy: [{ serviceDate: "desc" }, { slotStartMinute: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      code: true,
      kind: true,
      status: true,
      serviceDate: true,
      slotStartMinute: true,
      slotEndMinute: true,
      fulfillment: true,
      total: true,
      discountAmount: true,
      holdExpiresAt: true,
      restaurant: { select: { name: true, slug: true } },
      items: { select: { dishName: true, quantity: true } },
    },
  });
}

export async function getCustomerOrder(userId: string, code: string) {
  const order = await db.order.findUnique({
    where: { code },
    include: {
      restaurant: { select: { name: true, slug: true, addressLine: true, phone: true, customerCancelRefundBps: true } },
      items: { include: { modifiers: { orderBy: { sortOrder: "asc" } } }, orderBy: { id: "asc" } },
      events: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!order || order.customerId !== userId) return null;
  return order;
}

export type CustomerOrder = NonNullable<Awaited<ReturnType<typeof getCustomerOrder>>>;
