import { z } from "zod";
import { emailSchema } from "@/modules/auth/schemas";

// Esquemas de los formularios del super admin. Los porcentajes se escriben
// como en la vida real ("10", "12,5") y se guardan en bps (1000 = 10%).

/** "12,5" | "12.5" | "10" | "10 %" → bps (1250, 1000). null si no es un número con hasta 2 decimales. */
export function parsePercentToBps(raw: string): number | null {
  const s = raw.trim().replace(/\s*%$/, "").replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/** bps → texto editable ("12,5") para precargar los formularios. */
export function bpsToPercentInput(bps: number): string {
  return (bps / 100).toString().replace(".", ",");
}

const percent = (label: string, maxBps: number) =>
  z
    .string()
    .trim()
    .min(1, { error: `Ingresá ${label}` })
    .transform((v, ctx) => {
      const bps = parsePercentToBps(v);
      if (bps === null) {
        ctx.addIssue({ code: "custom", message: `${label[0].toUpperCase()}${label.slice(1)} inválida (ej. 10 o 12,5)` });
        return z.NEVER;
      }
      if (bps > maxBps) {
        ctx.addIssue({ code: "custom", message: `Como máximo ${maxBps / 100}%` });
        return z.NEVER;
      }
      return bps;
    });

/** Checkbox/switch de un formulario HTML: presente ("on"/"true") = true. */
const checkbox = z
  .string()
  .nullable()
  .optional()
  .transform((v) => v === "on" || v === "true");

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, { error: "Al menos 3 caracteres" })
  .max(60)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { error: "Solo minúsculas, números y guiones (ej. la-cocina-de-rosa)" });

/** "La Cocina de Doña Rosa" → "la-cocina-de-dona-rosa" */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export const commercialTermsSchema = z.object({
  commission: percent("la comisión", 5000),
  refundsCommission: checkbox,
  penalty: percent("la penalidad", 10000),
  macrosRequired: checkbox,
});

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

const ownerNew = z.object({
  ownerMode: z.literal("new"),
  ownerName: z.string().trim().min(2, { error: "Ingresá el nombre del responsable" }).max(80),
  ownerEmail: emailSchema,
  ownerPassword: z
    .string()
    .min(8, { error: "La contraseña inicial debe tener al menos 8 caracteres" })
    .max(72, { error: "La contraseña es demasiado larga" }),
});

const ownerExisting = z.object({
  ownerMode: z.literal("existing"),
  existingOwnerEmail: emailSchema,
});

export const ownerSchema = z.discriminatedUnion("ownerMode", [ownerNew, ownerExisting]);

export const restaurantBasicsSchema = z.object({
  name: z.string().trim().min(2, { error: "Ingresá el nombre del restaurante" }).max(80),
  slug: slugSchema,
  addressLine: z.string().trim().min(3, { error: "Ingresá la dirección" }).max(160),
  zoneId: z.string().min(1, { error: "Elegí una zona" }),
  phone: optionalText(30).pipe(z.string().regex(/^[+\d\s()-]*$/, { error: "Teléfono inválido" }).optional()),
  email: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined))
    .pipe(emailSchema.optional()),
  description: optionalText(400),
});

export const createRestaurantSchema = restaurantBasicsSchema.and(commercialTermsSchema).and(ownerSchema);

export type CreateRestaurantInput = z.infer<typeof createRestaurantSchema>;

export const RESTAURANT_STATUSES = ["PENDING", "ACTIVE", "SUSPENDED", "CLOSED"] as const;

export const statusChangeSchema = z.object({
  restaurantId: z.string().min(1),
  status: z.enum(RESTAURANT_STATUSES),
  reason: z.string().trim().max(300).optional().transform((v) => (v ? v : undefined)),
});

export const addAdminSchema = z.object({ restaurantId: z.string().min(1) }).and(ownerSchema);

/** Primer mensaje por campo (para mostrar en el formulario). */
export function fieldErrors(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
