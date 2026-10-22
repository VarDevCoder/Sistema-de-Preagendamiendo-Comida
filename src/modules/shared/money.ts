// Dinero en guaraníes (PYG): siempre enteros, sin decimales.
// Porcentajes en basis points (bps): 1000 = 10%, 10000 = 100%.

export const BPS_100 = 10_000;

/** Aplica un porcentaje en bps a un monto y redondea al guaraní más cercano. */
export function applyBps(amount: number, bps: number): number {
  assertInt(amount, "amount");
  assertInt(bps, "bps");
  return Math.round((amount * bps) / BPS_100);
}

/**
 * Reparte `total` entre partes proporcionales a `weights` sin perder ni sumar
 * guaraníes (método del mayor resto). Σ resultado === total, siempre.
 */
export function allocateProportionally(total: number, weights: number[]): number[] {
  assertInt(total, "total");
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (sum === 0) {
    // Sin pesos: todo a la primera parte para que el total cuadre.
    return weights.map((_, i) => (i === 0 ? total : 0));
  }
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map(Math.floor);
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] += 1;
    remainder -= 1;
  }
  return floors;
}

const gsFormatter = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });

/** 45000 → "Gs. 45.000" */
export function formatGs(amount: number): string {
  return `Gs. ${gsFormatter.format(amount)}`;
}

/** 1250 → "12,5%" */
export function formatBps(bps: number): string {
  return `${new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 }).format(bps / 100)}%`;
}

function assertInt(n: number, name: string) {
  if (!Number.isInteger(n)) throw new Error(`${name} debe ser un entero (recibido ${n})`);
}
