import type { Tx } from "@/lib/db-types";
import type { LedgerTxType } from "@/generated/prisma/enums";
import { accounts, describeAccount } from "./accounts";
import { assertBalanced, walletBalanceFromEntries, type Entry } from "./entries";

// Núcleo del ledger: funciona sobre una transacción SQL que provee quien llama
// (server actions, webhooks, seed). No importa el cliente global de la base.

export type { Tx };

export type PostLedgerInput = {
  type: LedgerTxType;
  description: string;
  /** Clave única del hecho contable: reintentar con la misma clave no duplica. */
  idempotencyKey: string;
  entries: Entry[];
  orderId?: string;
  subscriptionId?: string;
  paymentId?: string;
  settlementId?: string;
  claimId?: string;
  reversalOfId?: string;
  createdById?: string;
};

/**
 * Registra una transacción contable. Idempotente: si ya existe una con la
 * misma idempotencyKey, la devuelve sin crear nada.
 */
export async function postLedgerTransaction(tx: Tx, input: PostLedgerInput) {
  assertBalanced(input.entries);

  const existing = await tx.ledgerTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return existing;

  const accountIds = await ensureAccounts(
    tx,
    input.entries.map((e) => e.account),
  );

  const { entries, ...rest } = input;
  return tx.ledgerTransaction.create({
    data: {
      ...rest,
      entries: { create: entries.map((e) => ({ accountId: accountIds.get(e.account)!, amount: e.amount })) },
    },
  });
}

/** Crea (si hace falta) las cuentas por código y devuelve código → id. */
export async function ensureAccounts(tx: Tx, codes: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(codes)];
  await tx.ledgerAccount.createMany({
    data: unique.map((code) => {
      const ref = describeAccount(code);
      return { code, type: ref.type, userId: ref.userId, restaurantId: ref.restaurantId };
    }),
    skipDuplicates: true,
  });
  const rows = await tx.ledgerAccount.findMany({ where: { code: { in: unique } }, select: { id: true, code: true } });
  return new Map(rows.map((r) => [r.code, r.id]));
}

/**
 * Bloquea la cuenta de billetera (FOR UPDATE) y devuelve el saldo.
 * Usar antes de gastar saldo para que dos pagos simultáneos no lo dejen negativo.
 */
export async function lockWalletBalance(tx: Tx, userId: string): Promise<number> {
  const code = accounts.wallet(userId);
  const accountId = (await ensureAccounts(tx, [code])).get(code)!;
  await tx.$queryRaw`SELECT id FROM "LedgerAccount" WHERE id = ${accountId} FOR UPDATE`;
  return accountBalance(tx, accountId);
}

/** Saldo de una cuenta de billetera (pasivo: −Σ asientos). */
export async function accountBalance(client: Pick<Tx, "ledgerEntry">, accountId: string): Promise<number> {
  const agg = await client.ledgerEntry.aggregate({ where: { accountId }, _sum: { amount: true } });
  return walletBalanceFromEntries([agg._sum.amount ?? 0]);
}
