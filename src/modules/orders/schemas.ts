import { z } from "zod";
import { Allergen } from "@/generated/prisma/enums";
import { isDateKey } from "@/modules/shared/time";

// Lo que manda el cliente al confirmar un pedido: SOLO ids, cantidades y
// elecciones. Precios, descuentos y macros los calcula el servidor (RN-3).
// Cualquier otro campo (ej. "unitPrice") se descarta al parsear.

const id = z.string().trim().min(1).max(64);

export const MAX_NOTE_LENGTH = 140;
export const MAX_ITEMS = 20;
export const MAX_QUANTITY = 20;

export const checkoutItemSchema = z.object({
  dishId: id,
  optionIds: z.array(id).max(30).default([]),
  quantity: z.number().int().min(1, { error: "La cantidad mínima es 1" }).max(MAX_QUANTITY, { error: `Máximo ${MAX_QUANTITY} por plato` }),
  notes: z
    .string()
    .trim()
    .max(MAX_NOTE_LENGTH, { error: `La nota puede tener hasta ${MAX_NOTE_LENGTH} caracteres` })
    .optional()
    .transform((v) => (v ? v : undefined)),
});

export const allergenListSchema = z
  .array(z.enum(Object.values(Allergen) as [Allergen, ...Allergen[]]))
  .max(Object.values(Allergen).length)
  .default([])
  .transform((list) => [...new Set(list)]);

export const allergyOtherSchema = z
  .string()
  .trim()
  .max(80, { error: "Máximo 80 caracteres" })
  .optional()
  .transform((v) => (v ? v : undefined));

export const checkoutSchema = z
  .object({
    restaurantSlug: z.string().trim().min(1).max(80),
    date: z.string().refine(isDateKey, { error: "Fecha inválida" }),
    slotId: z.string({ error: "Elegí una franja horaria" }).trim().min(1, { error: "Elegí una franja horaria" }).max(64),
    fulfillment: z.enum(["PICKUP", "DELIVERY"], { error: "Elegí retiro o delivery" }),
    addressId: z
      .string()
      .trim()
      .max(64)
      .optional()
      .transform((v) => (v ? v : undefined)),
    allergens: allergenListSchema,
    allergyOther: allergyOtherSchema,
    useWallet: z.boolean().default(false),
    /** Generada por el navegador una vez por intento de compra: un doble submit devuelve el mismo pedido. */
    checkoutKey: z.string().trim().min(16).max(64),
    items: z
      .array(checkoutItemSchema)
      .min(1, { error: "Tu carrito está vacío" })
      .max(MAX_ITEMS, { error: `Máximo ${MAX_ITEMS} líneas por pedido` }),
  })
  .superRefine((v, ctx) => {
    if (v.fulfillment === "DELIVERY" && !v.addressId) {
      ctx.addIssue({ code: "custom", path: ["addressId"], message: "Elegí una dirección de entrega" });
    }
  })
  .transform((v) => {
    // "Otro" se guarda si hay texto; sin texto no tiene sentido.
    const allergens = v.allergyOther
      ? [...new Set([...v.allergens, "OTHER" as const])]
      : v.allergens.filter((a) => a !== "OTHER");
    return { ...v, allergens };
  });

export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type CheckoutItemInput = z.infer<typeof checkoutItemSchema>;

/** Errores de Zod → { campo: [mensajes] } para mostrar en el formulario. */
export function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
