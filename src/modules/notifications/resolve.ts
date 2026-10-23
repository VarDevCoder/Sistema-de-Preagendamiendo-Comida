import { db } from "@/lib/db";
import type { OrderStatus } from "@/generated/prisma/enums";
import { dbDateToKey } from "@/modules/shared/time";
import { accounts } from "@/modules/wallet/accounts";
import { buildContent, type ContentInput, type OrderInfo } from "./content";
import type { NotificationEvent } from "./events";
import { eventKey } from "./keys";
import type { ResolvedNotification } from "./notifier";

// Resuelve, leyendo la base, a quién va cada evento y con qué datos.
// Devuelve null si la entidad no existe o el evento ya no aplica (ej. un
// recordatorio de un pedido que se canceló entre la consulta del cron y el envío).

const customerSelect = { select: { id: true, email: true, name: true, isActive: true } } as const;

const orderSelect = {
  id: true,
  code: true,
  status: true,
  serviceDate: true,
  slotStartMinute: true,
  slotEndMinute: true,
  fulfillment: true,
  total: true,
  cancelReason: true,
  updatedAt: true,
  restaurant: { select: { name: true } },
  customer: customerSelect,
} as const;

const NOT_CONFIRMED: OrderStatus[] = ["PENDING_PAYMENT", "EXPIRED", "PAYMENT_FAILED"];

async function loadOrder(orderId: string) {
  return db.order.findUnique({ where: { id: orderId }, select: orderSelect });
}
type LoadedOrder = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;

function orderInfo(o: LoadedOrder): OrderInfo {
  return {
    code: o.code,
    restaurantName: o.restaurant.name,
    serviceDate: dbDateToKey(o.serviceDate),
    slotStartMinute: o.slotStartMinute,
    slotEndMinute: o.slotEndMinute,
    fulfillment: o.fulfillment,
    total: o.total,
  };
}

type Recipient = { id: string; email: string; name: string | null; isActive: boolean };

function resolved(
  recipient: Recipient,
  orderId: string | null,
  key: string,
  input: ContentInput,
): ResolvedNotification {
  return {
    userId: recipient.id,
    userActive: recipient.isActive,
    email: recipient.email,
    name: recipient.name,
    orderId,
    eventKey: key,
    content: buildContent(input),
  };
}

/**
 * Lo que efectivamente volvió a la billetera por la cancelación del pedido:
 * créditos (asientos negativos) a la billetera del cliente en transacciones
 * REFUND_TO_WALLET del pedido, sin contar créditos por cambios del plan.
 */
async function refundedToWallet(orderId: string, userId: string): Promise<number> {
  const agg = await db.ledgerEntry.aggregate({
    _sum: { amount: true },
    where: {
      account: { code: accounts.wallet(userId) },
      transaction: { orderId, type: "REFUND_TO_WALLET", orderChange: { is: null } },
    },
  });
  return Math.max(0, -(agg._sum.amount ?? 0));
}

export async function resolveEvent(event: NotificationEvent): Promise<ResolvedNotification | null> {
  switch (event.type) {
    case "ORDER_CONFIRMED":
    case "ORDER_REMINDER":
    case "ORDER_READY": {
      const o = await loadOrder(event.orderId);
      if (!o) return null;
      if (event.type === "ORDER_CONFIRMED" && NOT_CONFIRMED.includes(o.status)) return null;
      if (event.type === "ORDER_REMINDER" && o.status !== "CONFIRMED") return null;
      return resolved(o.customer, o.id, eventKey(event), { type: event.type, order: orderInfo(o) });
    }
    case "ORDER_CANCELLED": {
      const o = await loadOrder(event.orderId);
      if (!o || (o.status !== "CANCELLED_BY_RESTAURANT" && o.status !== "CANCELLED_BY_CUSTOMER")) return null;
      return resolved(o.customer, o.id, eventKey(event), {
        type: "ORDER_CANCELLED",
        order: orderInfo(o),
        byRestaurant: o.status === "CANCELLED_BY_RESTAURANT",
        reason: o.cancelReason,
        refundAmount: await refundedToWallet(o.id, o.customer.id),
      });
    }
    case "PLAN_CONFIRMED": {
      const s = await db.subscription.findUnique({
        where: { id: event.subscriptionId },
        select: {
          code: true,
          periodStart: true,
          periodEnd: true,
          total: true,
          restaurant: { select: { name: true } },
          customer: customerSelect,
          _count: { select: { orders: true } },
        },
      });
      if (!s) return null;
      return resolved(s.customer, null, eventKey(event), {
        type: "PLAN_CONFIRMED",
        plan: {
          code: s.code,
          restaurantName: s.restaurant.name,
          periodStart: dbDateToKey(s.periodStart),
          periodEnd: dbDateToKey(s.periodEnd),
          days: s._count.orders,
          total: s.total,
        },
      });
    }
    case "PLAN_DAY_CHANGED": {
      const o = await loadOrder(event.orderId);
      if (!o) return null;
      const change = await db.orderChange.findFirst({
        where: { orderId: o.id },
        orderBy: { createdAt: "desc" },
        select: { id: true, settlement: true, difference: true },
      });
      const key = eventKey(event, { orderChangeId: change?.id, orderVersion: o.updatedAt.getTime() });
      return resolved(o.customer, o.id, key, {
        type: "PLAN_DAY_CHANGED",
        order: orderInfo(o),
        settlement: change?.settlement ?? null,
        difference: change?.difference ?? 0,
      });
    }
    case "WALLET_CREDITED": {
      if (!(event.amount > 0)) return null;
      const user = await db.user.findUnique({
        where: { id: event.userId },
        select: { id: true, email: true, name: true, isActive: true },
      });
      if (!user) return null;
      return resolved(user, null, eventKey(event), { type: "WALLET_CREDITED", amount: event.amount });
    }
    case "CLAIM_UPDATED": {
      const c = await db.claim.findUnique({
        where: { id: event.claimId },
        select: {
          status: true,
          resolution: true,
          refundAmount: true,
          orderId: true,
          order: { select: { code: true } },
          restaurant: { select: { name: true } },
          customer: customerSelect,
        },
      });
      if (!c) return null;
      return resolved(c.customer, c.orderId, eventKey(event, { claimStatus: c.status }), {
        type: "CLAIM_UPDATED",
        claim: {
          orderCode: c.order.code,
          restaurantName: c.restaurant.name,
          status: c.status,
          resolution: c.resolution,
          refundAmount: c.refundAmount,
        },
      });
    }
  }
}
