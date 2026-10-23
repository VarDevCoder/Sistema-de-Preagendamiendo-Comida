import { Badge } from "@/components/ui/badge";
import type { RestaurantStatus } from "@/generated/prisma/enums";
import { RESTAURANT_STATUS_LABEL } from "@/modules/shared/labels";

const VARIANT: Record<RestaurantStatus, "default" | "secondary" | "success" | "warning" | "destructive" | "outline"> = {
  PENDING: "warning",
  ACTIVE: "success",
  SUSPENDED: "destructive",
  CLOSED: "secondary",
};

export function RestaurantStatusBadge({ status }: { status: RestaurantStatus }) {
  return <Badge variant={VARIANT[status]}>{RESTAURANT_STATUS_LABEL[status]}</Badge>;
}
