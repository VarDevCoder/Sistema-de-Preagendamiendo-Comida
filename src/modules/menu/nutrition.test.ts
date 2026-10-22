import { describe, expect, it } from "vitest";
import {
  averageNutrition,
  checkMacroConsistency,
  formatMacrosCompact,
  itemNutrition,
  sumNutrition,
  ZERO_DELTA,
  type DishNutrition,
} from "./nutrition";

const milanesa: DishNutrition = {
  servingGrams: 350,
  kcal: 520,
  proteinG: 38,
  carbsG: 45,
  fatG: 18,
  fiberG: 3,
  sugarG: null,
  sodiumMg: 900,
};

const extraQueso = { ...ZERO_DELTA, kcalDelta: 110, proteinDeltaG: 7, fatDeltaG: 9, sodiumDeltaMg: 200 };
const sinPapas = { ...ZERO_DELTA, kcalDelta: -250, carbsDeltaG: -30, fatDeltaG: -12, fiberDeltaG: -2 };

describe("itemNutrition", () => {
  it("suma los deltas de los modificadores al plato", () => {
    expect(itemNutrition(milanesa, [extraQueso])).toEqual({
      servingGrams: 350,
      kcal: 630,
      proteinG: 45,
      carbsG: 45,
      fatG: 27,
      fiberG: 3,
      sugarG: null,
      sodiumMg: 1100,
    });
  });

  it("acepta deltas negativos pero nunca baja de 0", () => {
    const n = itemNutrition({ ...milanesa, carbsG: 20 }, [sinPapas])!;
    expect(n.kcal).toBe(270);
    expect(n.carbsG).toBe(0);
    expect(n.fatG).toBe(6);
  });

  it("devuelve null si el plato no tiene info nutricional", () => {
    expect(itemNutrition({ ...milanesa, kcal: null }, [extraQueso])).toBeNull();
  });
});

describe("sumNutrition", () => {
  it("multiplica por cantidad y marca el pedido completo", () => {
    const n = itemNutrition(milanesa, [])!;
    const r = sumNutrition([{ nutrition: n, quantity: 2 }]);
    expect(r.complete).toBe(true);
    expect(r.totals).toMatchObject({ kcal: 1040, proteinG: 76, sodiumMg: 1800, sugarG: null });
  });

  it("si falta un plato, suma lo conocido y marca incompleto", () => {
    const n = itemNutrition(milanesa, [])!;
    const r = sumNutrition([
      { nutrition: n, quantity: 1 },
      { nutrition: null, quantity: 1 },
    ]);
    expect(r.complete).toBe(false);
    expect(r.totals?.kcal).toBe(520);
  });

  it("totales y promedio diario de un plan mensual", () => {
    const n = itemNutrition(milanesa, [])!;
    const days = Array.from({ length: 20 }, () => ({ nutrition: n, quantity: 1 }));
    const { totals } = sumNutrition(days);
    expect(totals!.kcal).toBe(10_400);
    expect(averageNutrition(totals!, 20)).toMatchObject({ kcal: 520, proteinG: 38 });
  });
});

describe("checkMacroConsistency", () => {
  it("acepta valores dentro de la tolerancia", () => {
    // 38×4 + 45×4 + 18×9 = 494 → 520 es +5,3%
    expect(checkMacroConsistency(milanesa as never, 15)).toMatchObject({ ok: true, expectedKcal: 494 });
  });

  it("avisa si no cuadra", () => {
    expect(checkMacroConsistency({ kcal: 900, proteinG: 38, carbsG: 45, fatG: 18 }, 15).ok).toBe(false);
  });
});

describe("formatMacrosCompact", () => {
  it("formato de tarjeta", () => {
    expect(formatMacrosCompact(itemNutrition(milanesa, []))).toBe("520 kcal · P 38 · C 45 · G 18");
    expect(formatMacrosCompact(null)).toBe("Sin info nutricional");
  });
});
