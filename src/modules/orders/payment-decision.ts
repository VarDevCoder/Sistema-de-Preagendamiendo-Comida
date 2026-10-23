// Decisiones puras sobre cómo se paga un pedido (billetera total/parcial,
// pasarela) y qué hacer al aprobarse el pago. Sin base de datos: se testean solas.

export type PaymentSplit = {
  walletAmount: number;
  gatewayAmount: number;
  /** true → se paga 100% con saldo: el pedido se confirma en el acto. */
  walletOnly: boolean;
};

/**
 * Cuánto sale de la billetera y cuánto de la pasarela.
 * - available = saldo − lo ya comprometido por otros pagos pendientes vigentes.
 * - Nunca usa más que el total ni más que lo disponible; nunca negativo.
 */
export function splitPayment(p: { total: number; useWallet: boolean; walletBalance: number; walletReserved: number }): PaymentSplit {
  if (!Number.isInteger(p.total) || p.total <= 0) throw new Error("El total debe ser un entero positivo");
  const available = p.useWallet ? Math.max(0, p.walletBalance - Math.max(0, p.walletReserved)) : 0;
  const walletAmount = Math.min(available, p.total);
  const gatewayAmount = p.total - walletAmount;
  return { walletAmount, gatewayAmount, walletOnly: gatewayAmount === 0 };
}

export type ApprovalOutcome =
  /** Pago capturado: el pedido pasa a CONFIRMED y se registran los asientos. */
  | { kind: "CONFIRM" }
  /** Ya no hay cupo/stock: lo cobrado por la pasarela vuelve a la billetera. */
  | { kind: "REFUND_NO_ROOM"; reason: string }
  /** El saldo de billetera ya no alcanza para la parte comprometida. */
  | { kind: "REFUND_WALLET_SHORT"; reason: string }
  /** El pedido ya no está esperando pago (cancelado, rechazado…). */
  | { kind: "REFUND_NOT_PAYABLE"; reason: string };

/**
 * Qué hacer cuando la pasarela aprueba un pago. El orden importa: primero si
 * el pedido puede confirmarse, después cupo/stock, después el saldo.
 */
export function decideApproval(p: {
  orderPayable: boolean;
  room: { ok: true } | { ok: false; reason: string };
  walletAmount: number;
  walletBalance: number | null;
}): ApprovalOutcome {
  if (!p.orderPayable) return { kind: "REFUND_NOT_PAYABLE", reason: "El pedido ya no estaba esperando el pago." };
  if (!p.room.ok) return { kind: "REFUND_NO_ROOM", reason: p.room.reason };
  if (p.walletAmount > 0 && (p.walletBalance ?? 0) < p.walletAmount) {
    return {
      kind: "REFUND_WALLET_SHORT",
      reason: "Tu saldo en la billetera ya no alcanzaba para la parte que ibas a pagar con saldo.",
    };
  }
  return { kind: "CONFIRM" };
}
