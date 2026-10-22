import { describe, expect, it } from "vitest";
import { ZERO_DELTA } from "./nutrition";
import {
  modifierKey,
  modifierSummary,
  preloadSelection,
  validateSelection,
  type ModifierGroupDef,
  type ModifierOptionDef,
} from "./modifiers";

const opt = (id: string, extra: Partial<ModifierOptionDef> = {}): ModifierOptionDef => ({
  ...ZERO_DELTA,
  id,
  name: id,
  priceDelta: 0,
  isDefault: false,
  isActive: true,
  sortOrder: 0,
  preferenceTagId: null,
  ...extra,
});

const punto: ModifierGroupDef = {
  id: "punto",
  name: "Punto de cocción",
  required: true,
  minSelect: 1,
  maxSelect: 1,
  sortOrder: 0,
  options: [
    opt("jugoso", { sortOrder: 0, preferenceTagId: "tag-jugoso" }),
    opt("a-punto", { sortOrder: 1, isDefault: true }),
    opt("bien-cocido", { sortOrder: 2, preferenceTagId: "tag-bien-cocido" }),
  ],
};

const quitar: ModifierGroupDef = {
  id: "quitar",
  name: "Quitar",
  required: false,
  minSelect: 0,
  maxSelect: 2,
  sortOrder: 2,
  options: [
    opt("sin-cebolla", { preferenceTagId: "tag-sin-cebolla" }),
    opt("sin-tomate"),
    opt("sin-huevo", { isActive: false }),
  ],
};

const extras: ModifierGroupDef = {
  id: "extras",
  name: "Extras",
  required: false,
  minSelect: 0,
  maxSelect: 3,
  sortOrder: 1,
  options: [opt("queso", { priceDelta: 5000 }), opt("panceta", { priceDelta: 6000 })],
};

const groups = [punto, quitar, extras];

describe("validateSelection", () => {
  it("acepta una selección válida y la devuelve en orden de visualización", () => {
    const r = validateSelection(groups, ["sin-cebolla", "queso", "a-punto"]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.selected.map((s) => s.option.id)).toEqual(["a-punto", "queso", "sin-cebolla"]);
      expect(modifierSummary(r.selected)).toBe("a-punto · queso · sin-cebolla");
    }
  });

  it("exige los grupos obligatorios", () => {
    const r = validateSelection(groups, ["queso"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContainEqual(expect.objectContaining({ code: "REQUIRED_GROUP", groupId: "punto" }));
  });

  it("respeta maxSelect (selección única)", () => {
    const r = validateSelection(groups, ["jugoso", "a-punto"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatchObject({ code: "TOO_MANY", groupId: "punto" });
  });

  it("respeta minSelect en grupos opcionales con mínimo", () => {
    const r = validateSelection([{ ...extras, minSelect: 2 }], ["queso"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe("TOO_FEW");
  });

  it("rechaza opciones inactivas", () => {
    const r = validateSelection(groups, ["a-punto", "sin-huevo"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatchObject({ code: "INACTIVE_OPTION", optionId: "sin-huevo" });
  });

  it("rechaza opciones que no pertenecen al plato", () => {
    const r = validateSelection(groups, ["a-punto", "opcion-de-otro-plato"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe("UNKNOWN_OPTION");
  });

  it("rechaza opciones repetidas", () => {
    const r = validateSelection(groups, ["a-punto", "queso", "queso"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0].code).toBe("DUPLICATE_OPTION");
  });

  it("un grupo required con minSelect 0 exige igual al menos 1", () => {
    const r = validateSelection([{ ...punto, minSelect: 0 }], []);
    expect(r.ok).toBe(false);
  });
});

describe("modifierKey", () => {
  it("es independiente del orden (agrupación en cocina)", () => {
    expect(modifierKey(["b", "a"])).toBe(modifierKey(["a", "b"]));
    expect(modifierKey([])).toBe("");
  });
});

describe("preloadSelection", () => {
  const none = { dishOptionIds: new Set<string>(), tagIds: new Set<string>() };

  it("sin preferencias usa los defaults del restaurante", () => {
    expect(preloadSelection(groups, none)).toEqual(["a-punto"]);
  });

  it("aplica preferencias generales por tag", () => {
    const prefs = { dishOptionIds: new Set<string>(), tagIds: new Set(["tag-bien-cocido", "tag-sin-cebolla"]) };
    expect(preloadSelection(groups, prefs)).toEqual(["bien-cocido", "sin-cebolla"]);
  });

  it("la preferencia del plato gana a la general", () => {
    const prefs = { dishOptionIds: new Set(["jugoso"]), tagIds: new Set(["tag-bien-cocido"]) };
    expect(preloadSelection(groups, prefs)[0]).toBe("jugoso");
  });

  it("ignora preferencias que no aplican o están inactivas, sin error", () => {
    const prefs = { dishOptionIds: new Set(["sin-huevo", "no-existe"]), tagIds: new Set(["tag-sin-gluten"]) };
    expect(preloadSelection(groups, prefs)).toEqual(["a-punto"]);
  });

  it("nunca supera maxSelect", () => {
    const prefs = { dishOptionIds: new Set(["jugoso", "bien-cocido"]), tagIds: new Set<string>() };
    expect(preloadSelection([punto], prefs)).toEqual(["jugoso"]);
  });
});
