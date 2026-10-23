import { Badge } from "@/components/ui/badge";
import type { OrderStatus } from "@/generated/prisma/enums";
import { ORDER_STATUS_LABEL } from "@/modules/shared/labels";

const VARIANT: Partial<Record<OrderStatus, "default" | "secondary" | "success" | "warning" | "destructive" | "outline">> = {
  CONFIRMED: "outline",
  IN_PREPARATION: "warning",
  READY: "default",
  DELIVERED: "success",
  CANCELLED_BY_RESTAURANT: "destructive",
  CANCELLED_BY_CUSTOMER: "secondary",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge variant={VARIANT[status] ?? "secondary"}>{ORDER_STATUS_LABEL[status]}</Badge>;
}
