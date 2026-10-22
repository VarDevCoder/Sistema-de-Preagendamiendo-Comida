import { applyBps } from "@/modules/shared/money";
import { accounts } from "./accounts";

// Asientos de doble registro. Convención: amount > 0 = débito, < 0 = crédito.
// Todas las funciones devuelven asientos que suman 0 (se verifica en el
// servidor y, otra vez, en la base de datos con un constraint trigger).

export type Entry = { account: string; amount: number };

export function assertBalanced(entries: Entry[]): void {
  if (entries.length < 2) throw new Error("Una transacción contable necesita al menos 2 asientos");
  for (const e of entries) {
    if (!Number.isInteger(e.amount) || e.amount === 0) throw new Error(`Asiento inválido en ${e.account}: ${e.amount}`);
  }
  const sum = entries.reduce((a, e) => a + e.amount, 0);
  if (sum !== 0) throw new Error(`Transacción desbalanceada: suma ${sum}`);
}

/** Une asientos de la misma cuenta y descarta los que quedan en 0. */
export function compact(entries: Entry[]): Entry[] {
  const byAccount = new Map<string, number>();
  for (const e of entries) byAccount.set(e.account, (byAccount.get(e.account) ?? 0) + e.amount);
  return [...byAccount].filter(([, amount]) => amount !== 0).map(([account, amount]) => ({ account, amount }));
}

/**
 * Pago aprobado (pedido, plan o ajuste). Lo cobrado por la pasarela entra a
 * GATEWAY_CLEARING; lo pagado con billetera reduce el saldo del cliente.
 * Del total, la comisión es ingreso de la plataforma y el resto se le debe al restaurante.
 */
export function paymentCapturedEntries(p: {
  userId: string;
  restaurantId: string;
  gatewayAmount: number;
  walletAmount: number;
  commissionAmount: number;
}): Entry[] {
  const total = p.gatewayAmount + p.walletAmount;
  return compact([
    { account: accounts.gateway, amount: p.gatewayAmount },
    { account: accounts.wallet(p.userId), amount: p.walletAmount },
    { account: accounts.restaurant(p.restaurantId), amount: -(total - p.commissionAmount) },
    { account: accounts.commission, amount: -p.commissionAmount },
  ]);
}

/**
 * Cancelación por el RESTAURANTE. El cliente siempre recibe el 100% en la billetera.
 * Según el acuerdo con ese restaurante:
 * - refundsCommission: la plataforma devuelve su comisión (si no, la absorbe el restaurante),
 * - penaltyBps: penalidad extra sobre el total, que se descuenta de su liquidación.
 */
export function restaurantCancelEntries(p: {
  userId: string;
  restaurantId: string;
  total: number;
  commissionAmount: number;
  refundsCommission: boolean;
  penaltyBps: number;
}): Entry[] {
  const commissionBack = p.refundsCommission ? p.commissionAmount : 0;
  const penalty = applyBps(p.total, p.penaltyBps);
  return compact([
    { account: accounts.wallet(p.userId), amount: -p.total },
    { account: accounts.commission, amount: commissionBack },
    { account: accounts.restaurant(p.restaurantId), amount: p.total - commissionBack + penalty },
    { account: accounts.penalty, amount: -penalty },
  ]);
}

/**
 * Crédito a la billetera de una parte del valor de un pedido (cancelación del
 * cliente según la política, baja de precio en el plan). La comisión se
 * devuelve en la misma proporción.
 */
export function partialRefundEntries(p: {
  userId: string;
  restaurantId: string;
  total: number;
  commissionAmount: number;
  refundAmount: number;
}): Entry[] {
  if (p.refundAmount < 0 || p.refundAmount > p.total) throw new Error("Monto de reembolso fuera de rango");
  const commissionBack = p.total === 0 ? 0 : Math.round((p.commissionAmount * p.refundAmount) / p.total);
  return compact([
    { account: accounts.wallet(p.userId), amount: -p.refundAmount },
    { account: accounts.commission, amount: commissionBack },
    { account: accounts.restaurant(p.restaurantId), amount: p.refundAmount - commissionBack },
  ]);
}

/** Movimiento inverso exacto de otra transacción (corrección). */
export function reversalEntries(original: Entry[]): Entry[] {
  return original.map((e) => ({ account: e.account, amount: -e.amount }));
}

/** Saldo de billetera a partir de sus asientos (pasivo: −Σ). */
export function walletBalanceFromEntries(amounts: number[]): number {
  return -amounts.reduce((a, b) => a + b, 0);
}
