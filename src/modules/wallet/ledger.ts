import "server-only";
import { db } from "@/lib/db";
import { accounts } from "./accounts";
import { accountBalance } from "./ledger-tx";

export { postLedgerTransaction, ensureAccounts, lockWalletBalance } from "./ledger-tx";

export async function getWalletBalance(userId: string): Promise<number> {
  const account = await db.ledgerAccount.findUnique({ where: { code: accounts.wallet(userId) }, select: { id: true } });
  if (!account) return 0;
  return accountBalance(db, account.id);
}
