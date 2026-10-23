import { z } from "zod";
import { checkboxField, intField, optionalIntField, optionalText, timeField } from "@/modules/restaurants/form";
import { isDateKey } from "@/modules/shared/time";

// Esquemas del panel para disponibilidad (stock por fecha, plantilla semanal,
// feriados) y franjas horarias.

export const dateKeySchema = z.string().refine((s) => isDateKey(s), { error: "Fecha inválida" });

/** Plantilla semanal de un plato: stock por día (vacío = no se ofrece ese día). */
export const dishScheduleSchema = z.object({
  stocks: z.array(optionalIntField({ min: 0, max: 10_000 })).length(7),
});

export const dayStockSchema = z.object({
  stock: intField({ min: 0, max: 10_000, label: "el stock" }),
  isClosed: checkboxField,
});

export const addDishToDaySchema = z.object({
  dishId: z.string().min(1, { error: "Elegí un plato" }),
  stock: intField({ min: 0, max: 10_000, label: "el stock" }),
});

export const optionDayStockSchema = z.object({
  stock: intField({ min: 0, max: 10_000, label: "el stock" }),
});

export const closureSchema = z.object({
  date: dateKeySchema,
  reason: optionalText(120),
});

export const slotTemplateSchema = z
  .object({
    weekdays: z.array(z.number().int().min(1).max(7)).min(1, { error: "Elegí al menos un día" }),
    startMinute: timeField("la hora de inicio"),
    endMinute: timeField("la hora de fin"),
    capacity: intField({ min: 1, max: 1000, label: "el cupo" }),
    scope: z.enum(["PICKUP", "DELIVERY", "BOTH"], { error: "Elegí para qué modalidad es" }),
    isActive: checkboxField,
  })
  .superRefine((s, ctx) => {
    if (s.startMinute >= s.endMinute) {
      ctx.addIssue({ code: "custom", path: ["endMinute"], message: "El fin tiene que ser después del inicio." });
    } else if (s.endMinute - s.startMinute < 10) {
      ctx.addIssue({ code: "custom", path: ["endMinute"], message: "La franja tiene que durar al menos 10 minutos." });
    }
  });

export const dailySlotSchema = z.object({
  capacity: intField({ min: 0, max: 1000, label: "el cupo" }),
  isClosed: checkboxField,
});

export type SlotTemplateInput = z.infer<typeof slotTemplateSchema>;
