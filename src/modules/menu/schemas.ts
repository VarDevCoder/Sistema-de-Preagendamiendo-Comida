import { z } from "zod";
import {
  checkboxField,
  decimalOrZeroField,
  gsField,
  intField,
  intOrZeroField,
  optionalDecimalField,
  optionalIntField,
  optionalText,
  requiredText,
} from "@/modules/restaurants/form";
import { groupLimitErrors, hasAnyCoreMacro, hasCoreMacros } from "./menu-rules";

// Esquemas del panel: categorías, platos (con macros), grupos y opciones de modificadores.
// Entrada: strings del FormData.

const optionalId = z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().nullable());

const photoUrl = z.preprocess(
  (v) => (typeof v === "string" && v.trim() ? v.trim() : null),
  z
    .url({ protocol: /^https?$/, error: "Ingresá una URL que empiece con http:// o https://" })
    .max(500, { error: "La URL es demasiado larga" })
    .nullable(),
);

export const categorySchema = z.object({
  name: requiredText("el nombre de la categoría", 60),
  sortOrder: intOrZeroField({ min: 0, max: 9999 }),
});

export const dishSchema = z
  .object({
    name: requiredText("el nombre del plato", 80),
    description: optionalText(500),
    categoryId: optionalId,
    photoUrl,
    basePrice: gsField({ label: "el precio", min: 0, max: 5_000_000 }),
    isActive: checkboxField,
    allowNotes: checkboxField,
    sortOrder: intOrZeroField({ min: 0, max: 9999 }),
    servingGrams: optionalIntField({ min: 1, max: 5000 }),
    kcal: optionalIntField({ min: 0, max: 5000 }),
    proteinG: optionalDecimalField({ max: 1000 }),
    carbsG: optionalDecimalField({ max: 1000 }),
    fatG: optionalDecimalField({ max: 1000 }),
    fiberG: optionalDecimalField({ max: 1000 }),
    sugarG: optionalDecimalField({ max: 1000 }),
    sodiumMg: optionalIntField({ min: 0, max: 20_000 }),
  })
  .superRefine((d, ctx) => {
    // kcal y macros principales van juntos: con datos a medias el cliente vería valores engañosos.
    if (hasAnyCoreMacro(d) && !hasCoreMacros(d)) {
      for (const key of ["kcal", "proteinG", "carbsG", "fatG"] as const) {
        if (d[key] === null) {
          ctx.addIssue({ code: "custom", path: [key], message: "Completá kcal, proteínas, carbohidratos y grasas juntos." });
        }
      }
    }
  });

export const groupSchema = z
  .object({
    name: requiredText("el nombre del grupo", 60),
    description: optionalText(200),
    required: checkboxField,
    minSelect: intField({ min: 0, max: 20, label: "el mínimo" }),
    maxSelect: intField({ min: 1, max: 20, label: "el máximo" }),
  })
  .superRefine((g, ctx) => {
    const errors = groupLimitErrors(g);
    for (const [path, message] of Object.entries(errors)) ctx.addIssue({ code: "custom", path: [path], message });
  });

export const optionSchema = z.object({
  name: requiredText("el nombre de la opción", 60),
  priceDelta: gsField({ label: "el precio adicional", min: -1_000_000, max: 1_000_000, emptyAs: 0 }),
  isDefault: checkboxField,
  isActive: checkboxField,
  sortOrder: intOrZeroField({ min: 0, max: 9999 }),
  dailyStock: optionalIntField({ min: 0, max: 10_000 }),
  preferenceTagId: optionalId,
  kcalDelta: intOrZeroField({ min: -5000, max: 5000 }),
  proteinDeltaG: decimalOrZeroField({ min: -1000, max: 1000 }),
  carbsDeltaG: decimalOrZeroField({ min: -1000, max: 1000 }),
  fatDeltaG: decimalOrZeroField({ min: -1000, max: 1000 }),
  fiberDeltaG: decimalOrZeroField({ min: -1000, max: 1000 }),
  sugarDeltaG: decimalOrZeroField({ min: -1000, max: 1000 }),
  sodiumDeltaMg: intOrZeroField({ min: -20_000, max: 20_000 }),
});

export const dishGroupSchema = z.object({
  groupId: z.string().min(1, { error: "Elegí un grupo" }),
});

export type DishInput = z.infer<typeof dishSchema>;
export type GroupInput = z.infer<typeof groupSchema>;
export type OptionInput = z.infer<typeof optionSchema>;
