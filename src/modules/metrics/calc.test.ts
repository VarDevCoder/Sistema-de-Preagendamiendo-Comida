import { describe, expect, it } from "vitest";
import { dailySeries, forecastMatrix, niceMax, parsePeriod, rateBps, topModifiersByDish, topN } from "./calc";

describe("rateBps (tasa de cancelación)", () => {
  it("cancelados / pagos en bps, redondeado", () => {
    expect(rateBps(1, 4)).toBe(2500);
    expect(rateBps(1, 3)).toBe(3333);
    expect(rateBps(2, 3)).toBe(6667);
    expect(rateBps(0, 10)).toBe(0);
  });
  it("sin pedidos pagos la tasa es 0 (no NaN)", () => {
    expect(rateBps(0, 0)).toBe(0);
    expect(rateBps(3, 0)).toBe(0);
  });
});

describe("parsePeriod", () => {
  it("solo acepta 7 o 30", () => {
    expect(parsePeriod("30")).toBe(30);
    expect(parsePeriod("7")).toBe(7);
    expect(parsePeriod("90")).toBe(7);
    expect(parsePeriod(undefined)).toBe(7);
    expect(parsePeriod(["30", "7"])).toBe(30);
  });
});

describe("dailySeries", () => {
  it("rellena con 0 los días sin pedidos y cruza meses", () => {
    const s = dailySeries("2026-10-30", 4, new Map([["2026-10-31", 3], ["2026-11-02", 1]]));
    expect(s).toEqual([
      { date: "2026-10-30", value: 0 },
      { date: "2026-10-31", value: 3 },
      { date: "2026-11-01", value: 0 },
      { date: "2026-11-02", value: 1 },
    ]);
  });
});

describe("rankings", () => {
  it("topN ordena por valor y desempata alfabéticamente", () => {
    const r = topN(
      [
        { id: "1", label: "Pollo", value: 5 },
        { id: "2", label: "Milanesa", value: 9 },
        { id: "3", label: "Ensalada", value: 5 },
      ],
      2,
    );
    expect(r.map((x) => x.label)).toEqual(["Milanesa", "Ensalada"]);
  });

  it("modificadores más elegidos por plato con % sobre las unidades del plato", () => {
    const units = new Map([
      ["mila", { name: "Milanesa", units: 10 }],
      ["pollo", { name: "Pollo", units: 4 }],
    ]);
    const r = topModifiersByDish(
      [
        { dishId: "mila", dishName: "Milanesa", optionId: "pure", groupName: "Guarnición", optionName: "Puré", quantity: 6 },
        { dishId: "mila", dishName: "Milanesa", optionId: "tost", groupName: "Cocción", optionName: "Tostadita", quantity: 3 },
        { dishId: "mila", dishName: "Milanesa", optionId: "pure", groupName: "Guarnición", optionName: "Puré", quantity: 1 },
        { dishId: "pollo", dishName: "Pollo", optionId: "ens", groupName: "Guarnición", optionName: "Ensalada", quantity: 2 },
        { dishId: "otro", dishName: "Otro", optionId: "x", groupName: "G", optionName: "X", quantity: 1 },
      ],
      units,
    );
    expect(r).toEqual([
      {
        dishId: "mila",
        dishName: "Milanesa",
        units: 10,
        options: [
          { optionId: "pure", label: "Guarnición: Puré", quantity: 7, shareBps: 7000 },
          { optionId: "tost", label: "Cocción: Tostadita", quantity: 3, shareBps: 3000 },
        ],
      },
      { dishId: "pollo", dishName: "Pollo", units: 4, options: [{ optionId: "ens", label: "Guarnición: Ensalada", quantity: 2, shareBps: 5000 }] },
    ]);
  });
});

describe("forecastMatrix", () => {
  it("unidades por plato y día, ignorando fechas fuera del horizonte", () => {
    const dates = ["2026-10-22", "2026-10-23"];
    const m = forecastMatrix(
      [
        { dishId: "a", dishName: "A", date: "2026-10-22", quantity: 2 },
        { dishId: "a", dishName: "A", date: "2026-10-23", quantity: 1 },
        { dishId: "b", dishName: "B", date: "2026-10-23", quantity: 5 },
        { dishId: "b", dishName: "B", date: "2026-10-30", quantity: 50 },
      ],
      dates,
    );
    expect(m).toEqual([
      { dishId: "b", dishName: "B", total: 5, byDate: [0, 5] },
      { dishId: "a", dishName: "A", total: 3, byDate: [2, 1] },
    ]);
  });
});

describe("niceMax", () => {
  it("redondea hacia arriba a 1/2/5 × 10^n", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(13)).toBe(20);
    expect(niceMax(41)).toBe(50);
    expect(niceMax(100)).toBe(100);
  });
});
