import type { ClaimStatus } from "@/generated/prisma/enums";
import { accounts } from "@/modules/wallet/accounts";
import { compact, type Entry } from "@/modules/wallet/entries";
import { z } from "zod";

// Reglas puras de reclamos (RF-A6).

export type ClaimAbsorber = "RESTAURANT" | "PLATFORM";

export const CLAIM_ABSORBER_LABEL: Record<ClaimAbsorber, string> = {
  RESTAURANT: "Lo absorbe el restaurante (se descuenta de su liquidación)",
  PLATFORM: "Lo absorbe la plataforma (gasto de atención al cliente)",
};

/**
 * Reembolso de un reclamo a la billetera del cliente. El débito va a quien
 * absorbe el costo: RESTAURANT_PAYABLE (le debemos menos al restaurante) o
 * PLATFORM_GOODWILL (gasto de la plataforma).
 */
export function claimRefundEntries(p: { userId: string; restaurantId: string; amount: number; absorbedBy: ClaimAbsorber }): Entry[] {
  if (!Number.isInteger(p.amount) || p.amount <= 0) throw new Error("El reembolso debe ser un entero positivo");
  return compact([
    { account: accounts.wallet(p.userId), amount: -p.amount },
    { account: p.absorbedBy === "RESTAURANT" ? accounts.restaurant(p.restaurantId) : accounts.goodwill, amount: p.amount },
  ]);
}

/** Lo máximo que se puede devolver: el total del pedido menos lo ya acreditado por ese pedido. */
export function maxClaimRefund(orderTotal: number, alreadyRefunded: number): number {
  return Math.max(0, orderTotal - Math.max(0, alreadyRefunded));
}

export function isClaimClosed(status: ClaimStatus): boolean {
  return status === "RESOLVED" || status === "REJECTED";
}

export const CLAIM_STATUS_LABEL: Record<ClaimStatus, string> = {
  OPEN: "Abierto",
  IN_REVIEW: "En revisión",
  RESOLVED: "Resuelto",
  REJECTED: "Rechazado",
};

/** "45.000" | "45000" | "Gs. 45.000" → 45000 */
export function parseGs(raw: string): number | null {
  const s = raw.trim().replace(/^gs\.?\s*/i, "").replace(/[.\s]/g, "");
  if (s === "") return 0;
  if (!/^\d{1,9}$/.test(s)) return null;
  return Number(s);
}

export const resolveClaimSchema = z
  .object({
    claimId: z.string().min(1),
    decision: z.enum(["RESOLVE", "REJECT"]),
    resolution: z
      .string()
      .trim()
      .min(5, { error: "Explicá la resolución (al menos 5 caracteres)" })
      .max(500, { error: "Máximo 500 caracteres" }),
    refundAmount: z
      .string()
      .optional()
      .transform((v, ctx) => {
        const n = parseGs(v ?? "");
        if (n === null) {
          ctx.addIssue({ code: "custom", message: "Monto inválido (en guaraníes, sin decimales)" });
          return z.NEVER;
        }
        return n;
      }),
    absorbedBy: z.enum(["RESTAURANT", "PLATFORM"]).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.decision === "REJECT" && v.refundAmount > 0) {
      ctx.addIssue({ code: "custom", path: ["refundAmount"], message: "Un reclamo rechazado no lleva reembolso" });
    }
    if (v.refundAmount > 0 && !v.absorbedBy) {
      ctx.addIssue({ code: "custom", path: ["absorbedBy"], message: "Elegí quién absorbe el reembolso" });
    }
  });

export type ResolveClaimInput = z.infer<typeof resolveClaimSchema>;
