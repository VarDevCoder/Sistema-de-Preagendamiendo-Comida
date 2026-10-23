import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  bpsToPercentInput,
  checkboxField,
  fieldErrorsFrom,
  gsField,
  intOrZeroField,
  optionalDecimalField,
  optionalIntField,
  parseDecimal,
  parseGs,
  percentBpsField,
  percentToBps,
  readForm,
  timeField,
} from "./form";

describe("conversión % ↔ bps", () => {
  it("convierte porcentajes con coma o punto a bps", () => {
    expect(percentToBps("10")).toBe(1000);
    expect(percentToBps("12,5")).toBe(1250);
    expect(percentToBps("12.5")).toBe(1250);
    expect(percentToBps("0")).toBe(0);
    expect(percentToBps("100")).toBe(10000);
    expect(percentToBps(" 7,25 ")).toBe(725);
  });

  it("vacío → null y texto inválido → NaN", () => {
    expect(percentToBps("")).toBeNull();
    expect(percentToBps("diez")).toBeNaN();
  });

  it("bps → texto con coma decimal y sin ceros de más", () => {
    expect(bpsToPercentInput(1000)).toBe("10");
    expect(bpsToPercentInput(1250)).toBe("12,5");
    expect(bpsToPercentInput(10000)).toBe("100");
    expect(bpsToPercentInput(5)).toBe("0,05");
  });

  it("ida y vuelta conserva el valor", () => {
    for (const bps of [0, 1, 50, 999, 1000, 1250, 3333, 9000, 10000]) {
      expect(percentToBps(bpsToPercentInput(bps))).toBe(bps);
    }
  });

  it("percentBpsField valida el rango en %", () => {
    const f = percentBpsField({ maxPct: 90 });
    expect(f.parse("15")).toBe(1500);
    expect(f.safeParse("95").success).toBe(false);
    expect(f.safeParse("-1").success).toBe(false);
    expect(f.safeParse("").success).toBe(false);
  });
});

describe("parsers de texto", () => {
  it("parseGs acepta separador de miles y prefijo Gs.", () => {
    expect(parseGs("45.000")).toBe(45000);
    expect(parseGs("Gs. 45.000")).toBe(45000);
    expect(parseGs("45000")).toBe(45000);
    expect(parseGs("-5.000")).toBe(-5000);
    expect(parseGs("")).toBeNull();
    expect(parseGs("abc")).toBeNull();
  });

  it("parseDecimal acepta coma", () => {
    expect(parseDecimal("12,5")).toBe(12.5);
    expect(parseDecimal("3")).toBe(3);
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("1,2,3")).toBeNaN();
  });

  it("gsField con emptyAs y límites", () => {
    expect(gsField({ emptyAs: 0, min: -100 }).parse("")).toBe(0);
    expect(gsField().safeParse("").success).toBe(false);
    expect(gsField().safeParse("-1").success).toBe(false);
  });

  it("campos opcionales: vacío → null", () => {
    expect(optionalIntField().parse("")).toBeNull();
    expect(optionalIntField().parse("12")).toBe(12);
    expect(optionalIntField().safeParse("1.5").success).toBe(false);
    expect(optionalDecimalField().parse("")).toBeNull();
    expect(optionalDecimalField().parse("12,34")).toBe(12.3);
    expect(intOrZeroField().parse("")).toBe(0);
    expect(intOrZeroField().parse("-80")).toBe(-80);
  });

  it("checkbox y hora", () => {
    expect(checkboxField.parse("on")).toBe(true);
    expect(checkboxField.parse(null)).toBe(false);
    expect(timeField().parse("20:00")).toBe(1200);
    expect(timeField().parse("08:30")).toBe(510);
    expect(timeField().safeParse("25:00").success).toBe(false);
    expect(timeField().safeParse("").success).toBe(false);
  });
});

describe("helpers de formulario", () => {
  it("readForm normaliza checkboxes", () => {
    const fd = new FormData();
    fd.set("name", "Milanesa");
    fd.set("isActive", "on");
    expect(readForm(fd, ["name", "price"], ["isActive", "allowNotes"])).toEqual({
      name: "Milanesa",
      price: "",
      isActive: "on",
      allowNotes: "",
    });
  });

  it("fieldErrorsFrom agrupa por path", () => {
    const r = z.object({ a: z.string().min(2, { error: "corto" }), b: z.array(z.number()) }).safeParse({ a: "x", b: ["y"] });
    expect(r.success).toBe(false);
    if (!r.success) {
      const errors = fieldErrorsFrom(r.error);
      expect(errors.a).toEqual(["corto"]);
      expect(errors["b.0"]).toHaveLength(1);
    }
  });
});
