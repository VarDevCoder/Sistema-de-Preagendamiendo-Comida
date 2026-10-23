import "server-only";
import { db } from "@/lib/db";
import type { ClaimStatus } from "@/generated/prisma/enums";
import { refundedToWalletForOrder } from "./commands";
import { maxClaimRefund } from "./rules";

export async function listClaims(filter: "open" | "closed" | "all") {
  const status: ClaimStatus[] | undefined =
    filter === "open" ? ["OPEN", "IN_REVIEW"] : filter === "closed" ? ["RESOLVED", "REJECTED"] : undefined;
  const claims = await db.claim.findMany({
    where: status ? { status: { in: status } } : {},
    orderBy: [{ createdAt: "desc" }],
    take: 100,
    include: {
      customer: { select: { name: true, email: true } },
      restaurant: { select: { name: true, slug: true } },
      resolvedBy: { select: { name: true, email: true } },
      order: {
        select: {
          id: true,
          code: true,
          status: true,
          serviceDate: true,
          slotStartMinute: true,
          total: true,
          fulfillment: true,
          items: { select: { id: true, dishName: true, quantity: true, modifierSummary: true } },
        },
      },
    },
  });
  // Tope de reembolso por pedido (total − lo ya acreditado por cancelación o reclamos).
  const maxRefund = new Map<string, number>();
  await Promise.all(
    claims.map(async (c) => {
      maxRefund.set(c.id, maxClaimRefund(c.order.total, await refundedToWalletForOrder(db, c.orderId, c.customerId)));
    }),
  );
  return claims.map((c) => ({ ...c, maxRefund: maxRefund.get(c.id) ?? 0 }));
}

export type ClaimRow = Awaited<ReturnType<typeof listClaims>>[number];
