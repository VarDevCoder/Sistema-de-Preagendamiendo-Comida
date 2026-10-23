import { describe, expect, it } from "vitest";
import { buildProductionList, normalizeModifierKey, productionListState, type ProductionOrderInput } from "./grouping";
import { allergyText, formatDateLong, formatDateShort } from "./format";

let seq = 0;
function order(p: Partial<ProductionOrderInput> & { items: ProductionOrderInput["items"] }): ProductionOrderInput {
  seq += 1;
  return {
    id: `o${seq}`,
    code: `C${String(seq).padStart(2, "0")}`,
    customerName: `Cliente ${seq}`,
    slotStartMinute: 720,
    slotEndMinute: 750,
    fulfillment: "PICKUP",
    kind: "SINGLE",
    allergens: [],
    allergyOther: null,
    ...p,
  };
}
const mila = (key: string, summary: string, quantity = 1, notes: string | null = null) => ({
  dishId: "mila",
  dishName: "Milanesa",
  quantity,
  modifierKey: key,
  modifierSummary: summary,
  notes,
});
const pollo = (quantity = 1) => ({
  dishId: "pollo",
  dishName: "Pollo al horno",
  quantity,
  modifierKey: "",
  modifierSummary: "",
  notes: null,
});

describe("buildProductionList", () => {
  it("agrupa por (plato, combinación) y suma cantidades", () => {
    const list = buildProductionList([
      order({ items: [mila("normal,pure", "Normal · Puré", 2)] }),
      order({ items: [mila("normal,pure", "Normal · Puré", 1)] }),
      order({ items: [mila("pure,tostadita", "Tostadita · Puré", 3)] }),
      order({ items: [pollo(1)] }),
    ]);
    expect(list.dishes.map((d) => [d.dishName, d.total])).toEqual([
      ["Milanesa", 6],
      ["Pollo al horno", 1],
    ]);
    const mil = list.dishes[0];
    expect(mil.combos.map((c) => [c.summary, c.total])).toEqual([
      ["Normal · Puré", 3],
      ["Tostadita · Puré", 3],
    ]);
    expect(list.totals).toMatchObject({ orders: 4, units: 7, dishes: 2 });
  });

  it("combinaciones equivalentes (mismas opciones en otro orden) caen en el mismo grupo", () => {
    const list = buildProductionList([
      order({ items: [mila("b,a", "A · B")] }),
      order({ items: [mila("a,b", "A · B")] }),
      order({ items: [mila(" a , b ,a", "A · B")] }),
    ]);
    expect(list.dishes[0].combos).toHaveLength(1);
    expect(list.dishes[0].combos[0].total).toBe(3);
    expect(list.dishes[0].combos[0].modifierKey).toBe("a,b");
    expect(normalizeModifierKey("")).toBe("");
  });

  it("si una opción fue renombrada, usa el texto más frecuente del snapshot", () => {
    const list = buildProductionList([
      order({ items: [mila("x", "Tostadita")] }),
      order({ items: [mila("x", "Bien tostadita")] }),
      order({ items: [mila("x", "Bien tostadita")] }),
    ]);
    expect(list.dishes[0].combos[0].summary).toBe("Bien tostadita");
  });

  it("orden estable: el resultado no depende del orden de entrada", () => {
    const orders = [
      order({ code: "B", items: [mila("a", "A", 2), pollo(2)] }),
      order({ code: "A", slotStartMinute: 750, slotEndMinute: 780, items: [mila("b", "B", 2)] }),
      order({ code: "C", items: [mila("b", "B", 2), mila("a", "A", 0)] }),
    ];
    const a = buildProductionList(orders);
    const b = buildProductionList([...orders].reverse());
    expect(b).toEqual(a);
    // más unidades primero
    expect(a.dishes[0].combos.map((c) => c.summary)).toEqual(["B", "A"]);
    // dentro de un combo: por franja y luego por código
    expect(a.dishes[0].combos[0].orders.map((o) => o.code)).toEqual(["C", "A"]);
  });

  it("totales por franja (pedidos y unidades) y desglose por franja dentro de cada combinación", () => {
    const list = buildProductionList([
      order({ slotStartMinute: 750, slotEndMinute: 780, items: [mila("a", "A", 2)] }),
      order({ items: [mila("a", "A", 1), pollo(1)] }),
      order({ items: [pollo(3)] }),
    ]);
    expect(list.slots.map((s) => [s.startMinute, s.orders, s.units])).toEqual([
      [720, 2, 5],
      [750, 1, 2],
    ]);
    expect(list.slots[0].dishes).toEqual([
      { dishId: "pollo", dishName: "Pollo al horno", quantity: 4 },
      { dishId: "mila", dishName: "Milanesa", quantity: 1 },
    ]);
    const combo = list.dishes.find((d) => d.dishId === "mila")!.combos[0];
    expect(combo.bySlot).toEqual([
      { startMinute: 720, endMinute: 750, quantity: 1 },
      { startMinute: 750, endMinute: 780, quantity: 2 },
    ]);
    expect(list.dishes.find((d) => d.dishId === "pollo")!.bySlot).toEqual([{ startMinute: 720, endMinute: 750, quantity: 4 }]);
  });

  it("propaga las alergias del pedido a cada línea y al resumen de alertas", () => {
    const list = buildProductionList([
      order({ code: "ZZ", allergens: ["GLUTEN"], allergyOther: "frutillas", items: [mila("a", "A"), pollo()] }),
      order({ code: "AA", items: [mila("a", "A", 1, "  Bien caliente ")] }),
      order({ items: [pollo()] }),
    ]);
    const milCombo = list.dishes.find((d) => d.dishId === "mila")!.combos[0];
    expect(milCombo.hasAllergy).toBe(true);
    expect(milCombo.hasNotes).toBe(true);
    const zz = milCombo.orders.find((o) => o.code === "ZZ")!;
    expect(zz.allergens).toEqual(["GLUTEN"]);
    expect(zz.allergyOther).toBe("frutillas");
    const polloCombo = list.dishes.find((d) => d.dishId === "pollo")!.combos[0];
    expect(polloCombo.orders.find((o) => o.code === "ZZ")!.allergens).toEqual(["GLUTEN"]);
    expect(list.alerts.map((a) => a.code)).toEqual(["AA", "ZZ"]);
    expect(list.alerts[0].notes).toEqual([{ dishName: "Milanesa", text: "Bien caliente" }]);
    expect(list.totals.ordersWithAllergies).toBe(1);
    expect(list.totals.ordersWithNotes).toBe(1);
  });

  it("dos líneas iguales del mismo pedido se muestran en una sola fila", () => {
    const list = buildProductionList([order({ items: [mila("a", "A", 1, "uno"), mila("a", "A", 2, "dos")] })]);
    const c = list.dishes[0].combos[0];
    expect(c.orders).toHaveLength(1);
    expect(c.orders[0].quantity).toBe(3);
    expect(c.orders[0].notes).toBe("uno / dos");
  });

  it("empate de unidades entre combinaciones → orden alfabético del texto", () => {
    const list = buildProductionList([order({ items: [mila("z", "Zeta")] }), order({ items: [mila("y", "Alfa")] })]);
    expect(list.dishes[0].combos.map((c) => c.summary)).toEqual(["Alfa", "Zeta"]);
  });

  it("lista vacía", () => {
    expect(buildProductionList([])).toEqual({
      dishes: [],
      slots: [],
      alerts: [],
      totals: { orders: 0, units: 0, dishes: 0, ordersWithAllergies: 0, ordersWithNotes: 0 },
    });
  });
});

describe("productionListState", () => {
  const cutoff = new Date("2026-10-22T23:00:00Z");
  it("provisoria antes del corte y cerrada desde el corte", () => {
    expect(productionListState(cutoff, new Date("2026-10-22T22:59:59Z"))).toBe("PROVISIONAL");
    expect(productionListState(cutoff, cutoff)).toBe("CLOSED");
  });
});

describe("formatos", () => {
  it("fechas en español a partir del DateKey", () => {
    expect(formatDateLong("2026-10-23")).toBe("viernes 23 de octubre de 2026");
    expect(formatDateShort("2026-10-26")).toBe("lun 26/10");
  });
  it("texto de alergias", () => {
    expect(allergyText(["GLUTEN", "PEANUT"], null)).toBe("Gluten, Maní");
    expect(allergyText(["OTHER"], "frutillas")).toBe("frutillas");
    expect(allergyText(["OTHER"], null)).toBe("Otro");
    expect(allergyText([], null)).toBe("");
  });
});
