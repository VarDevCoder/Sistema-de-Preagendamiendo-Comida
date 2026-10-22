import { describe, expect, it } from "vitest";
import { advanceDiscountBps, hoursBetween, priceLine, priceOrder } from "./pricing";

describe("advanceDiscountBps", () => {
  const tiers = [
    { minHoursBefore: 24, discountBps: 1000 },
    { minHoursBefore: 72, discountBps: 1500 },
  ];

  it("elige el escalón más alto alcanzado", () => {
    expect(advanceDiscountBps(tiers, 10)).toBe(0);
    expect(advanceDiscountBps(tiers, 24)).toBe(1000);
    expect(advanceDiscountBps(tiers, 71.9)).toBe(1000);
    expect(advanceDiscountBps(tiers, 100)).toBe(1500);
  });

  it("mide horas entre instantes", () => {
    expect(hoursBetween(new Date("2026-11-01T12:00:00Z"), new Date("2026-11-02T12:00:00Z"))).toBe(24);
  });
});

describe("priceLine", () => {
  it("precio = base + Σ priceDelta, por cantidad", () => {
    expect(priceLine({ basePrice: 35_000, priceDeltas: [5_000, 0, 6_000], quantity: 2 })).toEqual({
      unitBasePrice: 35_000,
      unitModifiersTotal: 11_000,
      unitListPrice: 46_000,
      lineListTotal: 92_000,
    });
  });

  it("acepta deltas negativos pero no un precio negativo", () => {
    expect(priceLine({ basePrice: 10_000, priceDeltas: [-3_000], quantity: 1 }).unitListPrice).toBe(7_000);
    expect(() => priceLine({ basePrice: 1_000, priceDeltas: [-3_000], quantity: 1 })).toThrow();
  });

  it("rechaza cantidades inválidas", () => {
    expect(() => priceLine({ basePrice: 1_000, priceDeltas: [], quantity: 0 })).toThrow();
  });
});

describe("priceOrder", () => {
  it("aplica el descuento sobre el total con modificadores", () => {
    const p = priceOrder({ lineListTotals: [46_000, 30_000], discountBps: 1000, deliveryFee: 0, commissionBps: 1000 });
    expect(p.itemsSubtotal).toBe(76_000);
    expect(p.discountAmount).toBe(7_600);
    expect(p.total).toBe(68_400);
    expect(p.lineDiscounts.reduce((a, b) => a + b, 0)).toBe(7_600);
    expect(p.lineTotals).toEqual([41_400, 27_000]);
    expect(p.commissionAmount).toBe(6_840);
    expect(p.restaurantNet).toBe(61_560);
  });

  it("el envío no tiene descuento ni comisión", () => {
    const p = priceOrder({ lineListTotals: [40_000], discountBps: 1500, deliveryFee: 10_000, commissionBps: 1000 });
    expect(p.total).toBe(40_000 - 6_000 + 10_000);
    expect(p.commissionAmount).toBe(3_400);
  });

  it("las líneas siempre suman el total de comida", () => {
    const p = priceOrder({ lineListTotals: [33_333, 33_333, 33_334], discountBps: 1250, deliveryFee: 0, commissionBps: 0 });
    expect(p.lineTotals.reduce((a, b) => a + b, 0)).toBe(p.itemsSubtotal - p.discountAmount);
  });
});
