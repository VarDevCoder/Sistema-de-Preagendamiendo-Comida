import { describe, expect, it } from "vitest";
import {
  defaultsError,
  describeGroupLimits,
  groupHealthWarning,
  groupLimitErrors,
  macroWarning,
  MACROS_REQUIRED_MESSAGE,
  publishBlockReason,
} from "./menu-rules";
import { dishSchema, groupSchema, optionSchema } from "./schemas";

const dishForm = {
  name: "Milanesa",
  description: "",
  categoryId: "",
  photoUrl: "",
  basePrice: "45.000",
  isActive: "on",
  allowNotes: "",
  sortOrder: "",
  servingGrams: "",
  kcal: "",
  proteinG: "",
  carbsG: "",
  fatG: "",
  fiberG: "",
  sugarG: "",
  sodiumMg: "",
};

describe("dishSchema", () => {
  it("parsea precio en Gs. y deja macros en null si no se informan", () => {
    const d = dishSchema.parse(dishForm);
    expect(d).toMatchObject({ basePrice: 45000, isActive: true, allowNotes: false, sortOrder: 0, kcal: null, categoryId: null, photoUrl: null });
  });

  it("acepta decimales con coma en los macros", () => {
    const d = dishSchema.parse({ ...dishForm, kcal: "520", proteinG: "38,5", carbsG: "45", fatG: "18" });
    expect(d.proteinG).toBe(38.5);
  });

  it("exige kcal, P, C y G juntos", () => {
    const r = dishSchema.safeParse({ ...dishForm, kcal: "520" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.path[0]).sort()).toEqual(["carbsG", "fatG", "proteinG"]);
  });

  it("valida URL de foto y precio", () => {
    expect(dishSchema.safeParse({ ...dishForm, photoUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(dishSchema.safeParse({ ...dishForm, photoUrl: "https://example.com/a.jpg" }).success).toBe(true);
    expect(dishSchema.safeParse({ ...dishForm, basePrice: "" }).success).toBe(false);
    expect(dishSchema.safeParse({ ...dishForm, basePrice: "-100" }).success).toBe(false);
  });
});

describe("macros obligatorios y aviso de coherencia", () => {
  const empty = { kcal: null, proteinG: null, carbsG: null, fatG: null };
  const full = { kcal: 520, proteinG: 38, carbsG: 45, fatG: 18 };

  it("bloquea publicar sin macros solo si el restaurante los exige", () => {
    expect(publishBlockReason({ ...empty, isActive: true }, true)).toBe(MACROS_REQUIRED_MESSAGE);
    expect(publishBlockReason({ ...empty, isActive: false }, true)).toBeNull();
    expect(publishBlockReason({ ...empty, isActive: true }, false)).toBeNull();
    expect(publishBlockReason({ ...full, isActive: true }, true)).toBeNull();
  });

  it("avisa (sin bloquear) si las kcal no cuadran", () => {
    // 38×4 + 45×4 + 18×9 = 494 → 520 está a 5,3%
    expect(macroWarning(full, 15)).toBeNull();
    expect(macroWarning({ ...full, kcal: 900 }, 15)).toMatch(/≈ 494 kcal/);
    expect(macroWarning({ ...full, kcal: 560 }, 10)).toMatch(/13,4% de diferencia/);
    expect(macroWarning(empty, 15)).toBeNull();
  });
});

describe("grupos de modificadores", () => {
  it("min ≤ max y obligatorio ⇒ min ≥ 1", () => {
    expect(groupLimitErrors({ required: false, minSelect: 0, maxSelect: 1 })).toEqual({});
    expect(groupLimitErrors({ required: true, minSelect: 1, maxSelect: 1 })).toEqual({});
    expect(groupLimitErrors({ required: false, minSelect: 3, maxSelect: 2 }).minSelect).toMatch(/mayor que el máximo/);
    expect(groupLimitErrors({ required: true, minSelect: 0, maxSelect: 2 }).minSelect).toMatch(/obligatorio/);
    expect(groupLimitErrors({ required: false, minSelect: 0, maxSelect: 0 }).maxSelect).toBeDefined();
  });

  it("groupSchema expone los errores por campo", () => {
    const r = groupSchema.safeParse({ name: "Guarnición", required: "on", minSelect: "0", maxSelect: "1" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(["minSelect"]);
    expect(groupSchema.parse({ name: "Extras", required: "", minSelect: "0", maxSelect: "3" })).toMatchObject({ required: false, maxSelect: 3 });
  });

  it("describe los límites", () => {
    expect(describeGroupLimits({ required: true, minSelect: 1, maxSelect: 1 })).toBe("Elegí 1");
    expect(describeGroupLimits({ required: false, minSelect: 0, maxSelect: 3 })).toBe("Opcional, hasta 3");
    expect(describeGroupLimits({ required: true, minSelect: 1, maxSelect: 2 })).toBe("Elegí de 1 a 2");
  });

  it("no más opciones por defecto que maxSelect", () => {
    expect(defaultsError(1, 1)).toBeNull();
    expect(defaultsError(2, 1)).toMatch(/selección única/);
    expect(defaultsError(4, 3)).toMatch(/hasta 3/);
  });

  it("avisa si un grupo obligatorio no tiene suficientes opciones activas", () => {
    expect(groupHealthWarning({ required: true, minSelect: 1, maxSelect: 1 }, 0)).toMatch(/No tiene/);
    expect(groupHealthWarning({ required: true, minSelect: 2, maxSelect: 3 }, 1)).toMatch(/Exige elegir 2/);
    expect(groupHealthWarning({ required: false, minSelect: 0, maxSelect: 3 }, 2)).toBeNull();
  });
});

describe("optionSchema", () => {
  it("deltas vacíos → 0 y negativos permitidos", () => {
    const o = optionSchema.parse({ name: "Sin papas", priceDelta: "", isActive: "on", kcalDelta: "-250", carbsDeltaG: "-30,5", dailyStock: "" });
    expect(o).toMatchObject({ priceDelta: 0, kcalDelta: -250, carbsDeltaG: -30.5, proteinDeltaG: 0, dailyStock: null, isDefault: false, isActive: true });
  });

  it("stock diario opcional no negativo", () => {
    expect(optionSchema.parse({ name: "Extra panceta", priceDelta: "8.000", dailyStock: "10" }).dailyStock).toBe(10);
    expect(optionSchema.safeParse({ name: "Extra panceta", dailyStock: "-1" }).success).toBe(false);
  });
});
