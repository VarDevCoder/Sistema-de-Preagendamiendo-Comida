import "server-only";
import { db } from "@/lib/db";
import type { Tx } from "@/lib/db-types";
import type { ClaimStatus } from "@/generated/prisma/enums";
import { notify } from "@/modules/notifications/events";
import { accounts } from "@/modules/wallet/accounts";
import { postLedgerTransaction } from "@/modules/wallet/ledger-tx";
import { claimRefundEntries, isClaimClosed, maxClaimRefund, type ResolveClaimInput } from "./rules";

// Gestión de reclamos por el super admin. Quien llama ya verificó el rol.

export type ClaimCommandResult = { ok: true; noop?: boolean; ledgerTransactionId?: string } | { ok: false; error: string };

type LockedClaim = { id: string; status: ClaimStatus; orderId: string; customerId: string; restaurantId: string };

async function lockClaim(tx: Tx, claimId: string) {
  const rows = await tx.$queryRaw<LockedClaim[]>`
    SELECT id, status::text AS status, "orderId", "customerId", "restaurantId"
    FROM "Claim" WHERE id = ${claimId} FOR UPDATE`;
  return rows[0] ?? null;
}

/** Lo ya acreditado a la billetera del cliente por este pedido (cancelaciones y reclamos). */
export async function refundedToWalletForOrder(client: Pick<Tx, "ledgerEntry">, orderId: string, customerId: string) {
  const agg = await client.ledgerEntry.aggregate({
    where: {
      account: { code: accounts.wallet(customerId) },
      transaction: { orderId, type: { in: ["REFUND_TO_WALLET", "CLAIM_REFUND"] } },
    },
    _sum: { amount: true },
  });
  // Créditos a la billetera son negativos.
  return -(agg._sum.amount ?? 0);
}

export async function markClaimInReview(p: { claimId: string; actorId: string }): Promise<ClaimCommandResult> {
  const result = await db.$transaction(async (tx): Promise<ClaimCommandResult> => {
    const claim = await lockClaim(tx, p.claimId);
    if (!claim) return { ok: false, error: "No encontramos el reclamo." };
    if (claim.status === "IN_REVIEW") return { ok: true, noop: true };
    if (claim.status !== "OPEN") return { ok: false, error: "El reclamo ya está cerrado." };
    await tx.claim.update({ where: { id: claim.id }, data: { status: "IN_REVIEW" } });
    await tx.auditLog.create({
      data: { actorId: p.actorId, action: "claim.review", entityType: "Claim", entityId: claim.id, data: { from: claim.status, to: "IN_REVIEW" } },
    });
    return { ok: true };
  });
  if (result.ok && !result.noop) await notify({ type: "CLAIM_UPDATED", claimId: p.claimId });
  return result;
}

/**
 * Resuelve (con reembolso opcional a la billetera) o rechaza un reclamo.
 * Idempotente: un reclamo cerrado no se vuelve a procesar y el asiento usa
 * la clave `claim:<id>:refund`.
 */
export async function resolveClaim(input: ResolveClaimInput & { actorId: string; now?: Date }): Promise<ClaimCommandResult> {
  const now = input.now ?? new Date();
  const result = await db.$transaction(async (tx): Promise<ClaimCommandResult & { refund?: { userId: string; amount: number } }> => {
    const claim = await lockClaim(tx, input.claimId);
    if (!claim) return { ok: false, error: "No encontramos el reclamo." };
    if (isClaimClosed(claim.status)) return { ok: true, noop: true };

    const refund = input.decision === "RESOLVE" ? input.refundAmount : 0;
    if (refund > 0) {
      const order = await tx.order.findUniqueOrThrow({ where: { id: claim.orderId }, select: { total: true } });
      const max = maxClaimRefund(order.total, await refundedToWalletForOrder(tx, claim.orderId, claim.customerId));
      if (refund > max) return { ok: false, error: `Como máximo se pueden devolver Gs. ${max.toLocaleString("es-PY")} por este pedido.` };
    }

    await tx.claim.update({
      where: { id: claim.id },
      data: {
        status: input.decision === "RESOLVE" ? "RESOLVED" : "REJECTED",
        resolution: input.resolution,
        refundAmount: refund > 0 ? refund : null,
        resolvedById: input.actorId,
        resolvedAt: now,
      },
    });

    let ledgerTransactionId: string | undefined;
    if (refund > 0) {
      const ltx = await postLedgerTransaction(tx, {
        type: "CLAIM_REFUND",
        description: `Reembolso por reclamo · ${input.absorbedBy === "RESTAURANT" ? "a cargo del restaurante" : "a cargo de la plataforma"}`,
        idempotencyKey: `claim:${claim.id}:refund`,
        claimId: claim.id,
        orderId: claim.orderId,
        createdById: input.actorId,
        entries: claimRefundEntries({
          userId: claim.customerId,
          restaurantId: claim.restaurantId,
          amount: refund,
          absorbedBy: input.absorbedBy!,
        }),
      });
      ledgerTransactionId = ltx.id;
    }

    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: input.decision === "RESOLVE" ? "claim.resolve" : "claim.reject",
        entityType: "Claim",
        entityId: claim.id,
        data: { from: claim.status, refundAmount: refund, absorbedBy: refund > 0 ? input.absorbedBy : null, ledgerTransactionId: ledgerTransactionId ?? null },
      },
    });
    return { ok: true, ledgerTransactionId, refund: refund > 0 ? { userId: claim.customerId, amount: refund } : undefined };
  });

  if (result.ok && !result.noop) {
    await notify({ type: "CLAIM_UPDATED", claimId: input.claimId });
    if (result.refund && result.ledgerTransactionId) {
      await notify({ type: "WALLET_CREDITED", userId: result.refund.userId, amount: result.refund.amount, ledgerTransactionId: result.ledgerTransactionId });
    }
  }
  if (!result.ok) return result;
  return { ok: true, noop: result.noop, ledgerTransactionId: result.ledgerTransactionId };
}
