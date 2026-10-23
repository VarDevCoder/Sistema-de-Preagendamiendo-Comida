import { z } from "zod";
import { isDateKey } from "@/modules/shared/time";
import { CANCEL_REASON_MAX, CANCEL_REASON_MIN } from "./restaurant-transitions";

// Validación de las acciones del restaurante sobre pedidos (server actions).

export const dateParamSchema = z.string().refine(isDateKey, { error: "Fecha inválida" });

export const advanceSchema = z.object({
  slug: z.string().min(1),
  orderId: z.string().min(1),
  to: z.enum(["IN_PREPARATION", "READY", "DELIVERED"]),
});

export const cancelSchema = z.object({
  slug: z.string().min(1),
  orderId: z.string().min(1),
  reason: z
    .string()
    .trim()
    .min(CANCEL_REASON_MIN, { error: `Contá el motivo (al menos ${CANCEL_REASON_MIN} caracteres)` })
    .max(CANCEL_REASON_MAX, { error: "El motivo es demasiado largo" }),
});
