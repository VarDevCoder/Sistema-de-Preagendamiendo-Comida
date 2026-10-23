import { Badge } from "@/components/ui/badge";
import type { ClaimStatus } from "@/generated/prisma/enums";
import { CLAIM_STATUS_LABEL } from "@/modules/claims/rules";

const VARIANT: Record<ClaimStatus, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  OPEN: "warning",
  IN_REVIEW: "outline",
  RESOLVED: "success",
  REJECTED: "secondary",
};

export function ClaimStatusBadge({ status }: { status: ClaimStatus }) {
  return <Badge variant={VARIANT[status]}>{CLAIM_STATUS_LABEL[status]}</Badge>;
}
