"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/modules/auth/session";
import { fieldErrors } from "@/modules/admin/schemas";
import { markClaimInReview, resolveClaim } from "./commands";
import { resolveClaimSchema } from "./rules";

export type ClaimFormState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export async function markClaimInReviewAction(_prev: ClaimFormState, formData: FormData): Promise<ClaimFormState> {
  const admin = await requireUser(["SUPER_ADMIN"]);
  const claimId = String(formData.get("claimId") ?? "");
  if (!claimId) return { error: "Datos inválidos." };
  const result = await markClaimInReview({ claimId, actorId: admin.id });
  if (!result.ok) return { error: result.error };
  refresh();
  return { ok: true, message: "Reclamo en revisión." };
}

export async function resolveClaimAction(_prev: ClaimFormState, formData: FormData): Promise<ClaimFormState> {
  const admin = await requireUser(["SUPER_ADMIN"]);
  const parsed = resolveClaimSchema.safeParse({
    claimId: formData.get("claimId"),
    decision: formData.get("decision"),
    resolution: formData.get("resolution") ?? "",
    refundAmount: formData.get("refundAmount") ?? "",
    absorbedBy: formData.get("absorbedBy") || undefined,
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const result = await resolveClaim({ ...parsed.data, actorId: admin.id });
  if (!result.ok) return { error: result.error };
  refresh();
  if (result.noop) return { ok: true, message: "El reclamo ya estaba cerrado." };
  return { ok: true, message: parsed.data.decision === "RESOLVE" ? "Reclamo resuelto." : "Reclamo rechazado." };
}
