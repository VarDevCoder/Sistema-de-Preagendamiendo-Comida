import { z } from "zod";
import { BPS_100 } from "@/modules/shared/money";
import { formatMinute, parseMinute } from "@/modules/shared/time";

// Utilidades para los formularios del panel: el navegador manda todo como
// texto; acá se normaliza (vacío → null, "12,5" → 12.5, "45.000" → 45000) y
// se define el estado que devuelven las server actions a useActionState.

export type ActionState = {
  ok?: boolean;
  /** mensaje de éxito para mostrar al lado del botón */
  message?: string;
  /** error general (no asociado a un campo) */
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** aviso NO bloqueante (ej. coherencia de macros) */
  warning?: string;
  /** lo que escribió el usuario, para no perderlo si hay errores */
  values?: Record<string, string>;
};

export const initialActionState: ActionState = {};

/** Errores de Zod → { campo: [mensajes] } (la clave es el primer tramo del path). */
export function fieldErrorsFrom(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.map(String).join(".") : "form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/**
 * Lee del FormData los campos indicados como texto. Los booleanos (checkbox)
 * quedan "on" o "" para poder reconstruir el formulario si hay errores.
 */
export function readForm(formData: FormData, fields: readonly string[], booleans: readonly string[] = []) {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = formData.get(f);
    out[f] = typeof v === "string" ? v : "";
  }
  for (const b of booleans) out[b] = formData.get(b) ? "on" : "";
  return out;
}

/**
 * Todos los campos de texto enviados (sin los internos de React/Next). Se
 * devuelve en `values` cuando hay errores: un checkbox ausente = destildado.
 */
export function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("$ACTION") || typeof v !== "string") continue;
    out[k] = v;
  }
  return out;
}

/** Respuesta estándar para un error de validación. */
export function invalid(
  formData: FormData,
  fieldErrors: Record<string, string[] | undefined>,
  error = "Revisá los campos marcados.",
): ActionState {
  return { error, fieldErrors, values: formValues(formData) };
}

/** "HH:MM" opcional → minutos; vacío → null; inválido → NaN (lo rechaza Zod). */
export function minuteOrNull(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  try {
    return parseMinute(s);
  } catch {
    return Number.NaN;
  }
}

// ---------------------------------------------------------------------------
// Parsers de texto
// ---------------------------------------------------------------------------

/** "45.000", "45000", "Gs. 45.000" → 45000. Permite signo negativo. null si está vacío o no es número. */
export function parseGs(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  const negative = /^-/.test(s.replace(/^gs\.?\s*/i, ""));
  const digits = s.replace(/\D/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return negative ? -n : n;
}

/** "12,5" o "12.5" → 12.5. null si está vacío; NaN si no es número. */
export function parseDecimal(input: string): number | null {
  const s = input.trim().replace(",", ".");
  if (!s) return null;
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : Number.NaN;
}

/** Porcentaje escrito por el usuario → bps. "12,5" → 1250. null si vacío, NaN si inválido. */
export function percentToBps(input: string): number | null {
  const n = parseDecimal(input);
  if (n === null || Number.isNaN(n)) return n;
  return Math.round(n * 100);
}

/** bps → texto para un input de porcentaje. 1250 → "12,5"; 1000 → "10". */
export function bpsToPercentInput(bps: number): string {
  return String(bps / 100).replace(".", ",");
}

/** minutos → "HH:MM" para <input type="time">. */
export function minuteToInput(minute: number): string {
  return formatMinute(minute);
}

// ---------------------------------------------------------------------------
// Esquemas Zod reutilizables (entrada: string del FormData)
// ---------------------------------------------------------------------------

const toStr = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

/** Texto obligatorio con largo máximo. */
export const requiredText = (label: string, max = 120) =>
  z
    .string()
    .trim()
    .min(1, { error: `Ingresá ${label}` })
    .max(max, { error: `Máximo ${max} caracteres` });

/** Texto opcional: vacío → null. */
export const optionalText = (max = 500) =>
  z.preprocess(
    (v) => {
      const s = toStr(v).trim();
      return s === "" ? null : s;
    },
    z.string().max(max, { error: `Máximo ${max} caracteres` }).nullable(),
  );

/** Entero obligatorio en [min, max]. */
export const intField = (opts: { min?: number; max?: number; label?: string } = {}) => {
  const { min = 0, max = 1_000_000, label = "un número" } = opts;
  return z.preprocess(
    (v) => {
      const s = toStr(v).trim();
      if (s === "") return undefined;
      return /^-?\d+$/.test(s) ? Number(s) : Number.NaN;
    },
    z
      .number({ error: `Ingresá ${label}` })
      .int({ error: "Debe ser un número entero" })
      .min(min, { error: `Debe ser al menos ${min}` })
      .max(max, { error: `Debe ser como máximo ${max}` }),
  );
};

/** Entero opcional: vacío → null. */
export const optionalIntField = (opts: { min?: number; max?: number } = {}) => {
  const { min = 0, max = 1_000_000 } = opts;
  return z.preprocess(
    (v) => {
      const s = toStr(v).trim();
      if (s === "") return null;
      return /^-?\d+$/.test(s) ? Number(s) : Number.NaN;
    },
    z
      .number({ error: "Debe ser un número" })
      .int({ error: "Debe ser un número entero" })
      .min(min, { error: `Debe ser al menos ${min}` })
      .max(max, { error: `Debe ser como máximo ${max}` })
      .nullable(),
  );
};

/** Entero que puede ser negativo; vacío → 0 (ej. deltas de macros). */
export const intOrZeroField = (opts: { min?: number; max?: number } = {}) => {
  const { min = -1_000_000, max = 1_000_000 } = opts;
  return z.preprocess(
    (v) => {
      const s = toStr(v).trim();
      if (s === "") return 0;
      return /^-?\d+$/.test(s) ? Number(s) : Number.NaN;
    },
    z
      .number({ error: "Debe ser un número" })
      .int({ error: "Debe ser un número entero" })
      .min(min, { error: `Debe ser al menos ${min}` })
      .max(max, { error: `Debe ser como máximo ${max}` }),
  );
};

/** Decimal opcional (acepta coma): vacío → null. Redondea a 1 decimal. */
export const optionalDecimalField = (opts: { min?: number; max?: number } = {}) => {
  const { min = 0, max = 10_000 } = opts;
  return z.preprocess(
    (v) => parseDecimal(toStr(v)),
    z
      .number({ error: "Debe ser un número (ej. 12,5)" })
      .min(min, { error: `Debe ser al menos ${min}` })
      .max(max, { error: `Debe ser como máximo ${max}` })
      .transform((n) => Math.round(n * 10) / 10)
      .nullable(),
  );
};

/** Decimal obligatorio (acepta coma, permite negativos si min < 0). Vacío → 0. */
export const decimalOrZeroField = (opts: { min?: number; max?: number } = {}) => {
  const { min = -10_000, max = 10_000 } = opts;
  return z.preprocess(
    (v) => parseDecimal(toStr(v)) ?? 0,
    z
      .number({ error: "Debe ser un número (ej. 12,5)" })
      .min(min, { error: `Debe ser al menos ${min}` })
      .max(max, { error: `Debe ser como máximo ${max}` })
      .transform((n) => Math.round(n * 10) / 10),
  );
};

/** Monto en guaraníes obligatorio. */
export const gsField = (opts: { min?: number; max?: number; label?: string; emptyAs?: number } = {}) => {
  const { min = 0, max = 50_000_000, label = "un monto", emptyAs } = opts;
  return z.preprocess(
    (v) => parseGs(toStr(v)) ?? emptyAs,
    z
      .number({ error: `Ingresá ${label}` })
      .int()
      .min(min, { error: min === 0 ? "No puede ser negativo" : `Debe ser al menos Gs. ${min}` })
      .max(max, { error: "Monto demasiado alto" }),
  );
};

/** Porcentaje escrito en % → bps, en [minPct, maxPct]. */
export const percentBpsField = (opts: { minPct?: number; maxPct?: number } = {}) => {
  const { minPct = 0, maxPct = 100 } = opts;
  return z.preprocess(
    (v) => percentToBps(toStr(v)) ?? undefined,
    z
      .number({ error: "Ingresá un porcentaje (ej. 10 o 12,5)" })
      .int()
      .min(minPct * 100, { error: `Debe ser al menos ${minPct}%` })
      .max(maxPct * 100, { error: `Debe ser como máximo ${maxPct}%` }),
  );
};

/** Checkbox: presente → true. */
export const checkboxField = z.preprocess((v) => v === true || v === "on" || v === "true" || v === "1", z.boolean());

/** "HH:MM" → minutos desde 00:00. */
export const timeField = (label = "una hora") =>
  z.preprocess(
    (v) => {
      const s = toStr(v).trim();
      if (!s) return undefined;
      try {
        return parseMinute(s);
      } catch {
        return Number.NaN;
      }
    },
    z
      .number({ error: `Ingresá ${label}` })
      .int()
      .min(0)
      .max(1440, { error: "Hora inválida" }),
  );

/** Día ISO (1 = lunes … 7 = domingo). */
export const weekdayField = intField({ min: 1, max: 7, label: "un día" });

export const BPS_MAX = BPS_100;
