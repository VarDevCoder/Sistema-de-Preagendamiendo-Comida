import { allocateProportionally, applyBps } from "@/modules/shared/money";

// Precios: SIEMPRE se calculan en el servidor con estas funciones.
// Las igualdades también están garantizadas por CHECKs en la base de datos.

export type DiscountTier = { minHoursBefore: number; discountBps: number };

/**
 * Descuento por anticipación: el escalón de mayor minHoursBefore que se cumpla.
 * hoursBefore = horas entre la creación del pedido y el inicio de la franja.
 */
export function advanceDiscountBps(tiers: DiscountTier[], hoursBefore: number): number {
  let best: DiscountTier | null = null;
  for (const t of tiers) {
    if (hoursBefore >= t.minHoursBefore && (!best || t.minHoursBefore > best.minHoursBefore)) best = t;
  }
  return best?.discountBps ?? 0;
}

export function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 3_600_000;
}

export type LinePriceInput = { basePrice: number; priceDeltas: number[]; quantity: number };

export type LinePrice = {
  unitBasePrice: number;
  unitModifiersTotal: number;
  unitListPrice: number;
  lineListTotal: number;
};

/** Precio de lista de una línea: (base + Σ priceDelta) × cantidad. */
export function priceLine({ basePrice, priceDeltas, quantity }: LinePriceInput): LinePrice {
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error("La cantidad debe ser un entero ≥ 1");
  const unitModifiersTotal = priceDeltas.reduce((a, b) => a + b, 0);
  const unitListPrice = basePrice + unitModifiersTotal;
  if (unitListPrice < 0) throw new Error("El precio del ítem no puede ser negativo");
  return { unitBasePrice: basePrice, unitModifiersTotal, unitListPrice, lineListTotal: unitListPrice * quantity };
}

export type OrderPriceInput = {
  lineListTotals: number[];
  discountBps: number;
  deliveryFee: number;
  commissionBps: number;
};

export type OrderPrice = {
  itemsSubtotal: number;
  discountAmount: number;
  lineDiscounts: number[];
  lineTotals: number[];
  deliveryFee: number;
  total: number;
  commissionAmount: number;
  /** lo que le corresponde al restaurante: total − comisión */
  restaurantNet: number;
};

/**
 * Totales del pedido:
 *   itemsSubtotal  = Σ líneas a precio normal
 *   discountAmount = itemsSubtotal × discountBps (anticipación O plan; no se acumulan)
 *   total          = itemsSubtotal − discountAmount + deliveryFee
 * El descuento se reparte entre líneas sin perder guaraníes.
 * La comisión se calcula sobre lo cobrado por comida (sin el envío).
 */
export function priceOrder({ lineListTotals, discountBps, deliveryFee, commissionBps }: OrderPriceInput): OrderPrice {
  if (lineListTotals.length === 0) throw new Error("El pedido no tiene ítems");
  if (deliveryFee < 0) throw new Error("El costo de envío no puede ser negativo");
  const itemsSubtotal = lineListTotals.reduce((a, b) => a + b, 0);
  const discountAmount = applyBps(itemsSubtotal, discountBps);
  const lineDiscounts = allocateProportionally(discountAmount, lineListTotals);
  const lineTotals = lineListTotals.map((t, i) => t - lineDiscounts[i]);
  const total = itemsSubtotal - discountAmount + deliveryFee;
  const commissionAmount = applyBps(itemsSubtotal - discountAmount, commissionBps);
  return {
    itemsSubtotal,
    discountAmount,
    lineDiscounts,
    lineTotals,
    deliveryFee,
    total,
    commissionAmount,
    restaurantNet: total - commissionAmount,
  };
}

/** Cuánto ahorra el cliente frente al precio normal (para mostrar en la UI). */
export function savings(price: Pick<OrderPrice, "discountAmount">): number {
  return price.discountAmount;
}
