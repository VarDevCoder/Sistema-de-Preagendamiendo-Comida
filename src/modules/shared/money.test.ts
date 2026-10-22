import { describe, expect, it } from "vitest";
import { allocateProportionally, applyBps, formatBps, formatGs } from "./money";

describe("applyBps", () => {
  it("aplica porcentajes en basis points y redondea al guaraní", () => {
    expect(applyBps(45_000, 1000)).toBe(4_500);
    expect(applyBps(33_333, 1500)).toBe(5_000); // 4999,95 → 5000
    expect(applyBps(10_000, 0)).toBe(0);
  });

  it("rechaza montos con decimales", () => {
    expect(() => applyBps(10.5, 1000)).toThrow();
  });
});

describe("allocateProportionally", () => {
  it("reparte sin perder ni sumar guaraníes", () => {
    const parts = allocateProportionally(1_000, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1_000);
    expect(parts).toEqual([334, 333, 333]);
  });

  it("respeta las proporciones", () => {
    expect(allocateProportionally(9_000, [30_000, 60_000])).toEqual([3_000, 6_000]);
  });

  it("con pesos en cero asigna todo a la primera parte", () => {
    expect(allocateProportionally(500, [0, 0])).toEqual([500, 0]);
  });
});

describe("formato", () => {
  it("formatea guaraníes y porcentajes", () => {
    expect(formatGs(45_000)).toBe("Gs. 45.000");
    expect(formatBps(1250)).toBe("12,5%");
  });
});
