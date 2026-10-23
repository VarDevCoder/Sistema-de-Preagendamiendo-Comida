import type { Allergen, ClaimReason, OrderStatus, RestaurantStatus } from "@/generated/prisma/enums";

export const ALLERGEN_LABEL: Record<Allergen, string> = {
  GLUTEN: "Gluten",
  LACTOSE: "Lactosa",
  PEANUT: "Maní",
  TREE_NUTS: "Frutos secos",
  SHELLFISH: "Mariscos",
  FISH: "Pescado",
  EGG: "Huevo",
  SOY: "Soja",
  SESAME: "Sésamo",
  OTHER: "Otro",
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Esperando pago",
  CONFIRMED: "Confirmado",
  IN_PREPARATION: "En preparación",
  READY: "Listo",
  DELIVERED: "Entregado",
  CANCELLED_BY_RESTAURANT: "Cancelado por el restaurante",
  CANCELLED_BY_CUSTOMER: "Cancelado",
  EXPIRED: "Vencido",
  PAYMENT_FAILED: "Pago rechazado",
};

export const RESTAURANT_STATUS_LABEL: Record<RestaurantStatus, string> = {
  PENDING: "En configuración",
  ACTIVE: "Activo",
  SUSPENDED: "Suspendido",
  CLOSED: "Dado de baja",
};

export const CLAIM_REASON_LABEL: Record<ClaimReason, string> = {
  NOT_DELIVERED: "No llegó el pedido",
  WRONG_ITEMS: "Pedido incorrecto",
  QUALITY: "Problema de calidad",
  ALLERGY_ISSUE: "Problema con una alergia",
  LATE: "Demora",
  OTHER: "Otro",
};
