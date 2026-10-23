import { describe, expect, it } from "vitest";
import { buildProductionList } from "./grouping";
import { makeSanitizer, renderProductionPdf } from "./pdf";

describe("renderProductionPdf", () => {
  it("genera un PDF válido con caracteres en español y alergias", async () => {
    const list = buildProductionList([
      {
        id: "o1",
        code: "ABC-123",
        customerName: "María Ñandutí",
        slotStartMinute: 720,
        slotEndMinute: 750,
        fulfillment: "DELIVERY",
        kind: "PLAN_DAY",
        allergens: ["GLUTEN"],
        allergyOther: "frutillas → evitar",
        items: [
          { dishId: "d", dishName: "Milanesa", quantity: 2, modifierKey: "a", modifierSummary: "Tostadita · Puré", notes: "Sin sal 🙏" },
        ],
      },
    ]);
    const bytes = await renderProductionPdf({
      restaurantName: "La Cocina de Doña Rosa",
      date: "2026-10-23",
      state: "PROVISIONAL",
      cutoffAt: new Date("2026-10-22T23:00:00Z"),
      generatedAt: new Date("2026-10-22T15:00:00Z"),
      list,
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("genera un PDF aunque no haya pedidos", async () => {
    const bytes = await renderProductionPdf({
      restaurantName: "X",
      date: "2026-10-23",
      state: "CLOSED",
      cutoffAt: new Date(),
      generatedAt: new Date(),
      list: buildProductionList([]),
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
  });
});

describe("makeSanitizer", () => {
  const ascii = new Set(Array.from({ length: 95 }, (_, i) => i + 32));
  it("reemplaza lo que la fuente no soporta", () => {
    const clean = makeSanitizer(ascii);
    expect(clean("Puré → ñ\n🙏")).toBe("Pure -> n ?");
  });
});
