import { z } from "zod";
import { allergenListSchema, allergyOtherSchema } from "@/modules/orders/schemas";

export const allergiesSchema = z
  .object({ allergens: allergenListSchema, allergyOther: allergyOtherSchema })
  .transform((v) => ({
    allergens: v.allergyOther ? [...new Set([...v.allergens, "OTHER" as const])] : v.allergens.filter((a) => a !== "OTHER"),
    allergyOther: v.allergyOther ?? null,
  }));

export const addressSchema = z.object({
  label: z.string().trim().min(1, { error: "Poné un nombre (ej. Casa)" }).max(40),
  street: z.string().trim().min(3, { error: "Ingresá la dirección" }).max(120),
  reference: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v ? v : undefined)),
  zoneId: z.string().trim().min(1, { error: "Elegí el barrio" }).max(64),
  isDefault: z.boolean().default(false),
});

export const dishPreferenceSchema = z.object({
  dishId: z.string().trim().min(1).max(64),
  optionIds: z.array(z.string().trim().min(1).max(64)).max(30),
});

export type AddressInput = z.infer<typeof addressSchema>;
