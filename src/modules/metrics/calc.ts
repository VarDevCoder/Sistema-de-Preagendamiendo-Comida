import { BPS_100 } from "@/modules/shared/money";
import { addDays, type DateKey } from "@/modules/shared/time";

// Cálculos puros de métricas (dashboard del restaurante y panel del super admin).

export const PERIOD_OPTIONS = [7, 30] as const;
export type PeriodDays = (typeof PERIOD_OPTIONS)[number];

/** "?periodo=30" → 30; cualquier otra cosa → 7. */
export function parsePeriod(raw: string | string[] | undefined): PeriodDays {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "30" ? 30 : 7;
}

/**
 * Tasa en bps (entero) de `part` sobre `total`, redondeada. 0 si no hay base.
 * Se usa para la tasa de cancelación: cancelados por el restaurante / pedidos pagos.
 */
export function rateBps(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part * BPS_100) / total);
}

/** Serie diaria continua (días sin pedidos = 0) para el gráfico de barras. */
export function dailySeries(from: DateKey, days: number, counts: Map<DateKey, number>): { date: DateKey; value: number }[] {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    return { date, value: counts.get(date) ?? 0 };
  });
}

export type RankItem = { id: string; label: string; value: number };

/** Top N por valor, empate → alfabético (estable). */
export function topN<T extends RankItem>(items: T[], n: number): T[] {
  return [...items].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "es") || (a.id < b.id ? -1 : 1)).slice(0, n);
}

export type ModifierPick = { dishId: string; dishName: string; optionId: string; groupName: string; optionName: string; quantity: number };

export type DishModifierRanking = {
  dishId: string;
  dishName: string;
  units: number;
  options: { optionId: string; label: string; quantity: number; shareBps: number }[];
};

/**
 * Modificadores más elegidos por plato. `dishUnits` = unidades vendidas del
 * plato (para expresar cada opción como % de los platos que la llevaron).
 */
export function topModifiersByDish(
  picks: ModifierPick[],
  dishUnits: Map<string, { name: string; units: number }>,
  perDish = 3,
  maxDishes = 5,
): DishModifierRanking[] {
  const byDish = new Map<string, Map<string, { label: string; quantity: number }>>();
  for (const p of picks) {
    const options = byDish.get(p.dishId) ?? new Map();
    byDish.set(p.dishId, options);
    const o = options.get(p.optionId) ?? { label: `${p.groupName}: ${p.optionName}`, quantity: 0 };
    o.quantity += p.quantity;
    options.set(p.optionId, o);
  }
  const out: DishModifierRanking[] = [];
  for (const [dishId, options] of byDish) {
    const dish = dishUnits.get(dishId);
    if (!dish) continue;
    const ranked = topN(
      [...options].map(([id, o]) => ({ id, label: o.label, value: o.quantity })),
      perDish,
    ).map((o) => ({ optionId: o.id, label: o.label, quantity: o.value, shareBps: rateBps(o.value, dish.units) }));
    out.push({ dishId, dishName: dish.name, units: dish.units, options: ranked });
  }
  return out.sort((a, b) => b.units - a.units || a.dishName.localeCompare(b.dishName, "es")).slice(0, maxDishes);
}

/** Forecast simple: unidades por plato y por día (próximos días) ya pagas. */
export function forecastMatrix(
  rows: { dishId: string; dishName: string; date: DateKey; quantity: number }[],
  dates: DateKey[],
): { dishId: string; dishName: string; total: number; byDate: number[] }[] {
  const idx = new Map(dates.map((d, i) => [d, i]));
  const byDish = new Map<string, { dishId: string; dishName: string; total: number; byDate: number[] }>();
  for (const r of rows) {
    const i = idx.get(r.date);
    if (i === undefined) continue;
    const d = byDish.get(r.dishId) ?? { dishId: r.dishId, dishName: r.dishName, total: 0, byDate: dates.map(() => 0) };
    d.byDate[i] += r.quantity;
    d.total += r.quantity;
    byDish.set(r.dishId, d);
  }
  return [...byDish.values()].sort((a, b) => b.total - a.total || a.dishName.localeCompare(b.dishName, "es"));
}

/** Escala "linda" para el eje del gráfico: 0, 1, 2, 5, 10, 20, 50… ≥ max. */
export function niceMax(max: number): number {
  if (max <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 5, 10]) if (m * pow >= max) return m * pow;
  return 10 * pow;
}
