import { checkMacroConsistency } from "./nutrition";

// Reglas puras del menú en el panel del restaurante (sin base de datos).

export type CoreMacros = {
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
};

/** true si el plato informa kcal, proteínas, carbohidratos y grasas. */
export function hasCoreMacros(m: CoreMacros): boolean {
  return m.kcal !== null && m.proteinG !== null && m.carbsG !== null && m.fatG !== null;
}

/** true si informa alguno de los cuatro (para exigir que vengan juntos). */
export function hasAnyCoreMacro(m: CoreMacros): boolean {
  return m.kcal !== null || m.proteinG !== null || m.carbsG !== null || m.fatG !== null;
}

export const MACROS_REQUIRED_MESSAGE =
  "Este restaurante tiene que informar kcal, proteínas, carbohidratos y grasas para publicar un plato.";

/**
 * Motivo por el que un plato no se puede publicar (isActive = true), o null.
 * Si el super admin marcó macrosRequired, sin macros completos solo se guarda como inactivo.
 */
export function publishBlockReason(dish: CoreMacros & { isActive: boolean }, macrosRequired: boolean): string | null {
  if (!dish.isActive || !macrosRequired) return null;
  return hasCoreMacros(dish) ? null : MACROS_REQUIRED_MESSAGE;
}

/**
 * Aviso NO bloqueante de coherencia kcal ≈ P×4 + C×4 + G×9.
 * Devuelve el texto del aviso o null si cuadra o no hay macros completos.
 */
export function macroWarning(m: CoreMacros, tolerancePct: number): string | null {
  if (!hasCoreMacros(m)) return null;
  const r = checkMacroConsistency(
    { kcal: m.kcal!, proteinG: m.proteinG!, carbsG: m.carbsG!, fatG: m.fatG! },
    tolerancePct,
  );
  if (r.ok) return null;
  return `Las kcal no cuadran con los macros: P×4 + C×4 + G×9 da ≈ ${r.expectedKcal} kcal y cargaste ${m.kcal} (${String(r.deviationPct).replace(".", ",")}% de diferencia, tolerancia ${tolerancePct}%). Revisá los valores; igual podés guardar.`;
}

export type GroupLimits = { required: boolean; minSelect: number; maxSelect: number };

/** Errores por campo de los límites de un grupo de modificadores. */
export function groupLimitErrors(g: GroupLimits): Partial<Record<"minSelect" | "maxSelect", string>> {
  const errors: Partial<Record<"minSelect" | "maxSelect", string>> = {};
  if (g.maxSelect < 1) errors.maxSelect = "Tiene que permitir elegir al menos 1.";
  if (g.minSelect < 0) errors.minSelect = "No puede ser negativo.";
  else if (g.minSelect > g.maxSelect) errors.minSelect = "El mínimo no puede ser mayor que el máximo.";
  if (g.required && g.minSelect < 1) errors.minSelect = "Si el grupo es obligatorio, el mínimo tiene que ser al menos 1.";
  return errors;
}

/** "Elegí 1", "Elegí hasta 3", "Elegí de 1 a 2", "Elegí 2" */
export function describeGroupLimits(g: GroupLimits): string {
  if (g.minSelect === g.maxSelect) return `Elegí ${g.maxSelect}`;
  if (g.minSelect === 0) return g.maxSelect === 1 ? "Opcional, hasta 1" : `Opcional, hasta ${g.maxSelect}`;
  return `Elegí de ${g.minSelect} a ${g.maxSelect}`;
}

/**
 * Las opciones "por defecto" se precargan; no pueden ser más que maxSelect.
 * `defaults` = cantidad de opciones por defecto contando la que se guarda.
 */
export function defaultsError(defaults: number, maxSelect: number): string | null {
  if (defaults <= maxSelect) return null;
  return maxSelect === 1
    ? "Este grupo es de selección única: ya hay otra opción marcada por defecto."
    : `Este grupo admite hasta ${maxSelect} opciones; no puede haber más por defecto.`;
}

/** Problemas de configuración de un grupo que conviene mostrar (no bloquean). */
export function groupHealthWarning(g: GroupLimits, activeOptions: number): string | null {
  const min = g.required ? Math.max(1, g.minSelect) : g.minSelect;
  if (activeOptions === 0) return "No tiene opciones activas.";
  if (activeOptions < min) return `Exige elegir ${min} pero solo hay ${activeOptions} opción(es) activa(s).`;
  return null;
}
