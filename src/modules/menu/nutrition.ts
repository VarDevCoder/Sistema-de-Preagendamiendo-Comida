// Información nutricional: la carga SIEMPRE el restaurante. Acá solo se suman
// los valores del plato y los deltas de los modificadores elegidos.

export type DishNutrition = {
  servingGrams: number | null;
  kcal: number | null; // null → "Sin info nutricional"
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
};

export type NutritionDelta = {
  kcalDelta: number;
  proteinDeltaG: number;
  carbsDeltaG: number;
  fatDeltaG: number;
  fiberDeltaG: number;
  sugarDeltaG: number;
  sodiumDeltaMg: number;
};

export type Nutrition = {
  servingGrams: number | null;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number | null;
  sugarG: number | null;
  sodiumMg: number | null;
};

export const ZERO_DELTA: NutritionDelta = {
  kcalDelta: 0,
  proteinDeltaG: 0,
  carbsDeltaG: 0,
  fatDeltaG: 0,
  fiberDeltaG: 0,
  sugarDeltaG: 0,
  sodiumDeltaMg: 0,
};

export function hasNutrition(dish: Pick<DishNutrition, "kcal">): boolean {
  return dish.kcal !== null;
}

/**
 * Macros de UNA unidad: plato + Σ deltas de las opciones, mínimo 0 por campo.
 * Devuelve null si el plato no tiene información nutricional.
 * Los campos opcionales (fibra, azúcares, sodio) quedan null si el plato no los informa.
 */
export function itemNutrition(dish: DishNutrition, deltas: NutritionDelta[]): Nutrition | null {
  if (dish.kcal === null) return null;
  const sum = (pick: (d: NutritionDelta) => number) => deltas.reduce((acc, d) => acc + pick(d), 0);
  const opt = (base: number | null, delta: number, round: (n: number) => number) =>
    base === null ? null : round(Math.max(0, base + delta));
  return {
    servingGrams: dish.servingGrams,
    kcal: roundInt(Math.max(0, dish.kcal + sum((d) => d.kcalDelta))),
    proteinG: round1(Math.max(0, (dish.proteinG ?? 0) + sum((d) => d.proteinDeltaG))),
    carbsG: round1(Math.max(0, (dish.carbsG ?? 0) + sum((d) => d.carbsDeltaG))),
    fatG: round1(Math.max(0, (dish.fatG ?? 0) + sum((d) => d.fatDeltaG))),
    fiberG: opt(dish.fiberG, sum((d) => d.fiberDeltaG), round1),
    sugarG: opt(dish.sugarG, sum((d) => d.sugarDeltaG), round1),
    sodiumMg: opt(dish.sodiumMg, sum((d) => d.sodiumDeltaMg), roundInt),
  };
}

export type NutritionTotals = {
  /** true si todos los ítems tenían información nutricional */
  complete: boolean;
  /** suma de los ítems que sí la tienen; null si ninguno la tiene */
  totals: Omit<Nutrition, "servingGrams"> | null;
};

/** Totales de un pedido o de un plan: Σ (macros por unidad × cantidad). */
export function sumNutrition(items: { nutrition: Nutrition | null; quantity: number }[]): NutritionTotals {
  const known = items.filter((i): i is { nutrition: Nutrition; quantity: number } => i.nutrition !== null);
  const complete = items.length > 0 && known.length === items.length;
  if (known.length === 0) return { complete, totals: null };

  const total = (pick: (n: Nutrition) => number) => known.reduce((acc, i) => acc + pick(i.nutrition) * i.quantity, 0);
  // Un campo opcional solo se suma si TODOS los ítems conocidos lo informan.
  const optTotal = (pick: (n: Nutrition) => number | null, round: (n: number) => number) =>
    known.every((i) => pick(i.nutrition) !== null)
      ? round(known.reduce((acc, i) => acc + (pick(i.nutrition) ?? 0) * i.quantity, 0))
      : null;

  return {
    complete,
    totals: {
      kcal: roundInt(total((n) => n.kcal)),
      proteinG: round1(total((n) => n.proteinG)),
      carbsG: round1(total((n) => n.carbsG)),
      fatG: round1(total((n) => n.fatG)),
      fiberG: optTotal((n) => n.fiberG, round1),
      sugarG: optTotal((n) => n.sugarG, round1),
      sodiumMg: optTotal((n) => n.sodiumMg, roundInt),
    },
  };
}

/** Promedio diario (para el plan mensual). */
export function averageNutrition(totals: Omit<Nutrition, "servingGrams">, days: number) {
  if (days <= 0) throw new Error("days debe ser > 0");
  const avg = (n: number | null, round: (x: number) => number) => (n === null ? null : round(n / days));
  return {
    kcal: roundInt(totals.kcal / days),
    proteinG: round1(totals.proteinG / days),
    carbsG: round1(totals.carbsG / days),
    fatG: round1(totals.fatG / days),
    fiberG: avg(totals.fiberG, round1),
    sugarG: avg(totals.sugarG, round1),
    sodiumMg: avg(totals.sodiumMg, roundInt),
  };
}

/**
 * Coherencia aproximada kcal ≈ P×4 + C×4 + G×9. Sirve para AVISAR al
 * restaurante; nunca bloquea el guardado.
 */
export function checkMacroConsistency(
  n: { kcal: number; proteinG: number; carbsG: number; fatG: number },
  tolerancePct: number,
): { ok: boolean; expectedKcal: number; deviationPct: number } {
  const expectedKcal = roundInt(n.proteinG * 4 + n.carbsG * 4 + n.fatG * 9);
  if (expectedKcal === 0 && n.kcal === 0) return { ok: true, expectedKcal, deviationPct: 0 };
  const base = Math.max(expectedKcal, 1);
  const deviationPct = round1((Math.abs(n.kcal - expectedKcal) / base) * 100);
  return { ok: deviationPct <= tolerancePct, expectedKcal, deviationPct };
}

/** "520 kcal · P 38 · C 45 · G 18" */
export function formatMacrosCompact(n: Pick<Nutrition, "kcal" | "proteinG" | "carbsG" | "fatG"> | null): string {
  if (!n) return "Sin info nutricional";
  return `${n.kcal} kcal · P ${Math.round(n.proteinG)} · C ${Math.round(n.carbsG)} · G ${Math.round(n.fatG)}`;
}

export const NUTRITION_DISCLAIMER = "Valores aproximados informados por el restaurante";

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function roundInt(n: number): number {
  return Math.round(n);
}
