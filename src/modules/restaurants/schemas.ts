import { z } from "zod";
import {
  checkboxField,
  intField,
  optionalText,
  percentBpsField,
  requiredText,
  timeField,
  gsField,
} from "./form";
import { maxGuaranteedPlanDays, validateTiers } from "./rules";

// Esquemas de la configuración del restaurante (Fase 3, /panel/[slug]/configuracion).
// Entrada: strings del FormData. Salida: valores listos para la base (bps, minutos, Gs.).

export const profileSchema = z.object({
  name: requiredText("el nombre del local", 80),
  description: optionalText(500),
  addressLine: requiredText("la dirección", 160),
  zoneId: z.string().min(1, { error: "Elegí la zona" }),
  phone: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim() : null),
    z
      .string()
      .max(20, { error: "Máximo 20 caracteres" })
      .regex(/^[+\d\s-]+$/, { error: "Teléfono inválido" })
      .nullable(),
  ),
  email: z.preprocess(
    (v) => (typeof v === "string" && v.trim() ? v.trim().toLowerCase() : null),
    z.email({ error: "Email inválido" }).nullable(),
  ),
});

export const fulfillmentSchema = z
  .object({
    pickupEnabled: checkboxField,
    deliveryEnabled: checkboxField,
    zones: z.array(z.object({ zoneId: z.string().min(1), fee: gsField({ label: "el costo de envío", max: 500_000 }) })),
  })
  .superRefine((v, ctx) => {
    if (!v.pickupEnabled && !v.deliveryEnabled) {
      ctx.addIssue({ code: "custom", path: ["pickupEnabled"], message: "Activá al menos una modalidad." });
    }
    if (v.deliveryEnabled && v.zones.length === 0) {
      ctx.addIssue({ code: "custom", path: ["zones"], message: "Para ofrecer delivery elegí al menos una zona." });
    }
  });

export const openingDaySchema = z
  .object({
    weekday: intField({ min: 1, max: 7 }),
    open: checkboxField,
    opensMinute: z.number().int().min(0).max(1440).nullable(),
    closesMinute: z.number().int().min(0).max(1440).nullable(),
  })
  .superRefine((d, ctx) => {
    if (!d.open) return;
    if (d.opensMinute === null || d.closesMinute === null) {
      ctx.addIssue({ code: "custom", path: ["opensMinute"], message: "Completá el horario." });
    } else if (d.opensMinute >= d.closesMinute) {
      ctx.addIssue({ code: "custom", path: ["opensMinute"], message: "La apertura tiene que ser antes del cierre." });
    }
  });

export const openingHoursSchema = z.object({ days: z.array(openingDaySchema).length(7) });

export const orderingSchema = z
  .object({
    cutoffDaysBefore: intField({ min: 0, max: 7, label: "los días de anticipación" }),
    cutoffMinute: timeField("la hora de corte").refine((m) => m <= 1439, { error: "Hora inválida" }),
    maxDaysAhead: intField({ min: 1, max: 120, label: "hasta cuántos días se puede pedir" }),
    customerCancelRefundBps: percentBpsField({ maxPct: 100 }),
  })
  .superRefine((v, ctx) => {
    if (v.maxDaysAhead < v.cutoffDaysBefore) {
      ctx.addIssue({
        code: "custom",
        path: ["maxDaysAhead"],
        message: "Tiene que ser al menos igual a los días de anticipación del corte; si no, no se podría pedir ningún día.",
      });
    }
  });

export const tierSchema = z.object({
  minHoursBefore: intField({ min: 0, max: 24 * 60, label: "las horas" }),
  discountBps: percentBpsField({ maxPct: 90 }),
});

export const tiersSchema = z
  .object({ tiers: z.array(tierSchema).max(8, { error: "Máximo 8 escalones" }) })
  .superRefine((v, ctx) => {
    const error = validateTiers(v.tiers);
    if (error) ctx.addIssue({ code: "custom", path: ["tiers"], message: error });
  });

export const planSchema = z
  .object({
    enabled: checkboxField,
    discountBps: percentBpsField({ maxPct: 90 }),
    weekdays: z.array(z.number().int().min(1).max(7)),
    periodMode: z.enum(["NEXT_MONTH", "REST_OF_MONTH_AND_NEXT"], { error: "Elegí el período" }),
    signupDeadlineDay: intField({ min: 1, max: 28, label: "el día límite" }),
    minDays: intField({ min: 1, max: 31, label: "el mínimo de días" }),
    cancelDaysBefore: intField({ min: 0, max: 7, label: "los días de anticipación" }),
    cancelMinute: timeField("la hora límite").refine((m) => m <= 1439, { error: "Hora inválida" }),
    cancelRefundBps: percentBpsField({ maxPct: 100 }),
    allowPause: checkboxField,
  })
  .superRefine((v, ctx) => {
    if (v.enabled && v.weekdays.length === 0) {
      ctx.addIssue({ code: "custom", path: ["weekdays"], message: "Elegí al menos un día de la semana." });
    }
    if (v.weekdays.length > 0 && v.minDays > maxGuaranteedPlanDays(v.weekdays)) {
      ctx.addIssue({
        code: "custom",
        path: ["minDays"],
        message: `Con ${new Set(v.weekdays).size} día(s) por semana, un mes puede tener solo ${maxGuaranteedPlanDays(v.weekdays)} días del plan.`,
      });
    }
  });

export type ProfileInput = z.infer<typeof profileSchema>;
export type OrderingInput = z.infer<typeof orderingSchema>;
export type PlanInput = z.infer<typeof planSchema>;
