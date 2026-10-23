import type { DishNutrition } from "@/modules/menu/nutrition";
import { sortGroups, type ModifierGroupDef, type ModifierOptionDef } from "@/modules/menu/modifiers";

// Adaptadores de filas de Prisma a las definiciones puras de menu/*.
// Solo grupos y opciones vigentes (deletedAt = null): se filtra en la consulta
// con DISH_MENU_INCLUDE y se vuelve a filtrar acá por las dudas.

export const DISH_MENU_INCLUDE = {
  modifierGroups: {
    where: { group: { deletedAt: null } },
    include: { group: { include: { options: { where: { deletedAt: null } } } } },
  },
} as const;

type OptionRow = ModifierOptionDef & { deletedAt: Date | null; dailyStock: number | null };
type GroupRow = {
  sortOrder: number;
  group: {
    id: string;
    name: string;
    required: boolean;
    minSelect: number;
    maxSelect: number;
    deletedAt: Date | null;
    options: OptionRow[];
  };
};

export function toGroupDefs(links: GroupRow[]): ModifierGroupDef[] {
  return sortGroups(
    links
      .filter((l) => l.group.deletedAt === null)
      .map((l) => ({
        id: l.group.id,
        name: l.group.name,
        required: l.group.required,
        minSelect: l.group.minSelect,
        maxSelect: l.group.maxSelect,
        sortOrder: l.sortOrder,
        options: l.group.options
          .filter((o) => o.deletedAt === null)
          .map((o) => ({
            id: o.id,
            name: o.name,
            priceDelta: o.priceDelta,
            isDefault: o.isDefault,
            isActive: o.isActive,
            sortOrder: o.sortOrder,
            preferenceTagId: o.preferenceTagId,
            kcalDelta: o.kcalDelta,
            proteinDeltaG: o.proteinDeltaG,
            carbsDeltaG: o.carbsDeltaG,
            fatDeltaG: o.fatDeltaG,
            fiberDeltaG: o.fiberDeltaG,
            sugarDeltaG: o.sugarDeltaG,
            sodiumDeltaMg: o.sodiumDeltaMg,
          })),
      })),
  );
}

/** Opciones con stock diario propio (dailyStock != null) entre los grupos vigentes. */
export function stockLimitedOptionIds(links: GroupRow[]): Set<string> {
  const out = new Set<string>();
  for (const l of links) for (const o of l.group.options) if (o.deletedAt === null && o.dailyStock !== null) out.add(o.id);
  return out;
}

export function dishNutrition(d: DishNutrition): DishNutrition {
  return {
    servingGrams: d.servingGrams,
    kcal: d.kcal,
    proteinG: d.proteinG,
    carbsG: d.carbsG,
    fatG: d.fatG,
    fiberG: d.fiberG,
    sugarG: d.sugarG,
    sodiumMg: d.sodiumMg,
  };
}
