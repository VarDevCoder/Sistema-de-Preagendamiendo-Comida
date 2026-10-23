import type { ClaimStatus, Fulfillment, NotificationType, OrderChangeSettlement } from "@/generated/prisma/enums";
import { formatGs } from "@/modules/shared/money";
import { formatMinute, type DateKey } from "@/modules/shared/time";
import { formatServiceDate, formatShortDate } from "./format";

// Contenido (en español) de cada notificación. Puro: recibe los datos ya
// resueltos de la base y devuelve título, cuerpo y destino. Lo usan los tres
// canales (in-app, email y push), así el mensaje es el mismo en todos.

export type OrderInfo = {
  code: string;
  restaurantName: string;
  serviceDate: DateKey;
  slotStartMinute: number;
  slotEndMinute: number;
  fulfillment: Fulfillment;
  total: number;
};

export type ContentInput =
  | { type: "ORDER_CONFIRMED"; order: OrderInfo }
  | { type: "ORDER_REMINDER"; order: OrderInfo }
  | { type: "ORDER_READY"; order: OrderInfo }
  | {
      type: "ORDER_CANCELLED";
      order: OrderInfo;
      byRestaurant: boolean;
      reason: string | null;
      refundAmount: number;
    }
  | {
      type: "PLAN_CONFIRMED";
      plan: {
        code: string;
        restaurantName: string;
        periodStart: DateKey;
        periodEnd: DateKey;
        days: number;
        total: number;
      };
    }
  | {
      type: "PLAN_DAY_CHANGED";
      order: OrderInfo;
      settlement: OrderChangeSettlement | null;
      difference: number; // nuevo total − anterior (positivo: pagó la diferencia)
    }
  | { type: "WALLET_CREDITED"; amount: number }
  | {
      type: "CLAIM_UPDATED";
      claim: {
        orderCode: string;
        restaurantName: string;
        status: ClaimStatus;
        resolution: string | null;
        refundAmount: number | null;
      };
    };

export type NotificationContent = {
  type: NotificationType;
  title: string;
  body: string;
  /** Ruta interna a la que lleva la notificación (siempre relativa, empieza con "/"). */
  url: string;
  /** Texto del botón del email. */
  cta: string;
};

export const orderUrl = (code: string) => `/cuenta/pedidos/${encodeURIComponent(code)}`;
export const planUrl = (code: string) => `/cuenta/planes/${encodeURIComponent(code)}`;
export const WALLET_URL = "/cuenta/billetera";

function slotText(o: OrderInfo): string {
  return `de ${formatMinute(o.slotStartMinute)} a ${formatMinute(o.slotEndMinute)}`;
}

function modeText(o: OrderInfo): string {
  return o.fulfillment === "DELIVERY" ? "con delivery" : "para retirar";
}

const refundText = (amount: number) =>
  amount > 0 ? ` Te devolvimos ${formatGs(amount)} a tu billetera.` : "";

export function buildContent(input: ContentInput): NotificationContent {
  switch (input.type) {
    case "ORDER_CONFIRMED": {
      const o = input.order;
      return {
        type: input.type,
        title: `Pedido ${o.code} confirmado`,
        body: `Tu pedido en ${o.restaurantName} es para el ${formatServiceDate(o.serviceDate)}, ${slotText(o)} (${modeText(o)}). Total pagado: ${formatGs(o.total)}.`,
        url: orderUrl(o.code),
        cta: "Ver mi pedido",
      };
    }
    case "ORDER_REMINDER": {
      const o = input.order;
      const action =
        o.fulfillment === "DELIVERY"
          ? `te llega tu pedido ${o.code} de ${o.restaurantName}`
          : `retirás tu pedido ${o.code} en ${o.restaurantName}`;
      return {
        type: input.type,
        title: "Mañana tenés pedido",
        body: `Recordatorio: mañana ${formatServiceDate(o.serviceDate)}, ${slotText(o)}, ${action}.`,
        url: orderUrl(o.code),
        cta: "Ver mi pedido",
      };
    }
    case "ORDER_READY": {
      const o = input.order;
      const next = o.fulfillment === "DELIVERY" ? "Sale en camino en breve." : "Ya podés pasar a retirarlo.";
      return {
        type: input.type,
        title: `¡Tu pedido ${o.code} está listo!`,
        body: `${o.restaurantName} terminó tu pedido. ${next}`,
        url: orderUrl(o.code),
        cta: "Ver mi pedido",
      };
    }
    case "ORDER_CANCELLED": {
      const o = input.order;
      const when = `del ${formatServiceDate(o.serviceDate)}`;
      const reason = input.reason?.trim() ? ` Motivo: ${input.reason.trim()}.` : "";
      const body = input.byRestaurant
        ? `${o.restaurantName} canceló tu pedido ${o.code} ${when}.${reason}${refundText(input.refundAmount)}`
        : `Cancelaste tu pedido ${o.code} en ${o.restaurantName} ${when}.${refundText(input.refundAmount)}`;
      return {
        type: input.type,
        title: `Pedido ${o.code} cancelado`,
        body,
        url: orderUrl(o.code),
        cta: "Ver detalle",
      };
    }
    case "PLAN_CONFIRMED": {
      const p = input.plan;
      const days = p.days === 1 ? "1 día" : `${p.days} días`;
      return {
        type: input.type,
        title: "Plan mensual confirmado",
        body: `Tu plan en ${p.restaurantName} del ${formatShortDate(p.periodStart)} al ${formatShortDate(p.periodEnd)} está confirmado: ${days}, total ${formatGs(p.total)}.`,
        url: planUrl(p.code),
        cta: "Ver mi plan",
      };
    }
    case "PLAN_DAY_CHANGED": {
      const o = input.order;
      let money = "";
      if (input.settlement === "WALLET_CREDIT" && input.difference < 0) {
        money = ` Te acreditamos ${formatGs(-input.difference)} en tu billetera.`;
      } else if (input.settlement === "CHARGED" && input.difference > 0) {
        money = ` Pagaste la diferencia de ${formatGs(input.difference)}.`;
      }
      return {
        type: input.type,
        title: `Cambiaste tu pedido del ${formatShortDate(o.serviceDate)}`,
        body: `Actualizamos tu pedido ${o.code} en ${o.restaurantName} para el ${formatServiceDate(o.serviceDate)}, ${slotText(o)}.${money}`,
        url: orderUrl(o.code),
        cta: "Ver mi pedido",
      };
    }
    case "WALLET_CREDITED":
      return {
        type: input.type,
        title: "Te acreditamos saldo",
        body: `Recibiste ${formatGs(input.amount)} en tu billetera. Podés usarlo en cualquier restaurante.`,
        url: WALLET_URL,
        cta: "Ver mi billetera",
      };
    case "CLAIM_UPDATED": {
      const c = input.claim;
      const resolution = c.resolution?.trim() ? ` ${c.resolution.trim()}` : "";
      const subject = `tu reclamo por el pedido ${c.orderCode} (${c.restaurantName})`;
      const byStatus: Record<ClaimStatus, { title: string; body: string }> = {
        OPEN: { title: "Recibimos tu reclamo", body: `Registramos ${subject}. Te avisamos cuando lo revisemos.` },
        IN_REVIEW: { title: "Estamos revisando tu reclamo", body: `Ya estamos revisando ${subject}.` },
        RESOLVED: {
          title: "Resolvimos tu reclamo",
          body: `Resolvimos ${subject}.${resolution}${refundText(c.refundAmount ?? 0)}`,
        },
        REJECTED: { title: "Tu reclamo fue rechazado", body: `Revisamos ${subject} y no pudimos aprobarlo.${resolution}` },
      };
      return {
        type: input.type,
        ...byStatus[c.status],
        url: orderUrl(c.orderCode),
        cta: "Ver mi pedido",
      };
    }
  }
}
