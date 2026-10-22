import type { NutritionDelta } from "./nutrition";

// Personalización ESTRUCTURADA: el cliente elige entre opciones cerradas que
// define el restaurante. Estas funciones son puras y se usan en el servidor
// (nunca se confía en lo que manda el cliente) y en la UI (precarga).

export type ModifierOptionDef = NutritionDelta & {
  id: string;
  name: string;
  priceDelta: number;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  preferenceTagId: string | null;
};

export type ModifierGroupDef = {
  id: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  /** orden del grupo en ESTE plato (DishModifierGroup.sortOrder) */
  sortOrder: number;
  options: ModifierOptionDef[];
};

export type SelectedModifier = { group: ModifierGroupDef; option: ModifierOptionDef };

export type SelectionErrorCode =
  | "UNKNOWN_OPTION"
  | "DUPLICATE_OPTION"
  | "INACTIVE_OPTION"
  | "REQUIRED_GROUP"
  | "TOO_FEW"
  | "TOO_MANY";

export type SelectionError = { code: SelectionErrorCode; groupId?: string; optionId?: string; message: string };

export type SelectionResult =
  | { ok: true; selected: SelectedModifier[] }
  | { ok: false; errors: SelectionError[] };

/** Ordena grupos (orden por plato) y opciones (orden del grupo). */
export function sortGroups(groups: ModifierGroupDef[]): ModifierGroupDef[] {
  return [...groups]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((g) => ({ ...g, options: [...g.options].sort((a, b) => a.sortOrder - b.sortOrder) }));
}

/** Mínimo efectivo de un grupo: un grupo obligatorio exige al menos 1. */
export function effectiveMin(group: Pick<ModifierGroupDef, "required" | "minSelect">): number {
  return group.required ? Math.max(1, group.minSelect) : group.minSelect;
}

/**
 * Valida la selección de opciones para un plato:
 * - cada opción pertenece a un grupo asignado a ESTE plato,
 * - sin repetidas, solo opciones activas,
 * - grupos obligatorios completos y min/max respetados.
 * Devuelve las opciones elegidas en orden de visualización.
 */
export function validateSelection(groups: ModifierGroupDef[], selectedOptionIds: string[]): SelectionResult {
  const errors: SelectionError[] = [];
  const sorted = sortGroups(groups);
  const byOption = new Map<string, SelectedModifier>();
  for (const group of sorted) for (const option of group.options) byOption.set(option.id, { group, option });

  const seen = new Set<string>();
  for (const id of selectedOptionIds) {
    if (seen.has(id)) {
      errors.push({ code: "DUPLICATE_OPTION", optionId: id, message: "Elegiste la misma opción dos veces." });
      continue;
    }
    seen.add(id);
    const found = byOption.get(id);
    if (!found) {
      errors.push({ code: "UNKNOWN_OPTION", optionId: id, message: "Esa opción no existe para este plato." });
    } else if (!found.option.isActive) {
      errors.push({
        code: "INACTIVE_OPTION",
        groupId: found.group.id,
        optionId: id,
        message: `"${found.option.name}" no está disponible hoy.`,
      });
    }
  }

  for (const group of sorted) {
    const count = group.options.filter((o) => seen.has(o.id)).length;
    const min = effectiveMin(group);
    if (count < min) {
      errors.push(
        group.required && count === 0
          ? { code: "REQUIRED_GROUP", groupId: group.id, message: `Elegí una opción en "${group.name}".` }
          : { code: "TOO_FEW", groupId: group.id, message: `Elegí al menos ${min} en "${group.name}".` },
      );
    }
    if (count > group.maxSelect) {
      errors.push({
        code: "TOO_MANY",
        groupId: group.id,
        message: `Podés elegir hasta ${group.maxSelect} en "${group.name}".`,
      });
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const selected: SelectedModifier[] = [];
  for (const group of sorted) for (const option of group.options) if (seen.has(option.id)) selected.push({ group, option });
  return { ok: true, selected };
}

/**
 * Clave canónica de la combinación (ids ordenados). La cocina agrupa por
 * (plato, modifierKey): "A punto + Sin cebolla" = "Sin cebolla + A punto".
 */
export function modifierKey(optionIds: string[]): string {
  return [...new Set(optionIds)].sort().join(",");
}

/** "A punto · Sin cebolla · Extra queso" (en orden de visualización). */
export function modifierSummary(selected: SelectedModifier[]): string {
  return selected.map((s) => s.option.name).join(" · ");
}

export type CustomerPreferenceSet = {
  /** preferencias específicas de este plato (ids de opciones) */
  dishOptionIds: ReadonlySet<string>;
  /** preferencias generales (ids de PreferenceTag) */
  tagIds: ReadonlySet<string>;
};

/**
 * Precarga de modificadores para un plato, por grupo:
 * 1) preferencias del cliente para ESTE plato,
 * 2) si no hay, preferencias generales (por tag),
 * 3) si no hay, las opciones por defecto del restaurante.
 * Solo opciones activas y nunca más que maxSelect. Lo que no aplica se ignora.
 */
export function preloadSelection(groups: ModifierGroupDef[], prefs: CustomerPreferenceSet): string[] {
  const out: string[] = [];
  for (const group of sortGroups(groups)) {
    const active = group.options.filter((o) => o.isActive);
    const byDish = active.filter((o) => prefs.dishOptionIds.has(o.id));
    const byTag = active.filter((o) => o.preferenceTagId !== null && prefs.tagIds.has(o.preferenceTagId));
    const defaults = active.filter((o) => o.isDefault);
    const chosen = byDish.length > 0 ? byDish : byTag.length > 0 ? byTag : defaults;
    out.push(...chosen.slice(0, group.maxSelect).map((o) => o.id));
  }
  return out;
}
