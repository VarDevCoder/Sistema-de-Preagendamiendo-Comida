import { describe, expect, it } from "vitest";
import {
  bpsToPercentInput,
  commercialTermsSchema,
  createRestaurantSchema,
  parsePercentToBps,
  slugify,
  slugSchema,
  statusChangeSchema,
} from "./schemas";

describe("porcentajes → bps", () => {
  it("acepta coma o punto y hasta 2 decimales", () => {
    expect(parsePercentToBps("10")).toBe(1000);
    expect(parsePercentToBps("12,5")).toBe(1250);
    expect(parsePercentToBps("12.25")).toBe(1225);
    expect(parsePercentToBps(" 5 %")).toBe(500);
    expect(parsePercentToBps("0")).toBe(0);
  });
  it("rechaza texto, negativos y demasiados decimales", () => {
    expect(parsePercentToBps("diez")).toBeNull();
    expect(parsePercentToBps("-5")).toBeNull();
    expect(parsePercentToBps("1,234")).toBeNull();
    expect(parsePercentToBps("")).toBeNull();
  });
  it("bps → texto editable", () => {
    expect(bpsToPercentInput(1250)).toBe("12,5");
    expect(bpsToPercentInput(1000)).toBe("10");
  });
});

describe("commercialTermsSchema", () => {
  it("convierte a bps y lee los checkboxes del formulario", () => {
    const r = commercialTermsSchema.parse({ commission: "12,5", penalty: "5", refundsCommission: "on", macrosRequired: null });
    expect(r).toEqual({ commission: 1250, penalty: 500, refundsCommission: true, macrosRequired: false });
  });
  it("limita la comisión al 50% y la penalidad al 100%", () => {
    expect(commercialTermsSchema.safeParse({ commission: "60", penalty: "0" }).success).toBe(false);
    expect(commercialTermsSchema.safeParse({ commission: "10", penalty: "101" }).success).toBe(false);
    expect(commercialTermsSchema.safeParse({ commission: "", penalty: "0" }).success).toBe(false);
  });
});

describe("slug", () => {
  it("slugify quita tildes y espacios", () => {
    expect(slugify("La Cocina de Doña Rosa")).toBe("la-cocina-de-dona-rosa");
    expect(slugify("  ¡Parrilla El Quincho!  ")).toBe("parrilla-el-quincho");
  });
  it("valida el formato", () => {
    expect(slugSchema.safeParse("mi-resto-2").success).toBe(true);
    expect(slugSchema.safeParse("Mi Resto").success).toBe(false);
    expect(slugSchema.safeParse("mi--resto").success).toBe(false);
    expect(slugSchema.safeParse("ab").success).toBe(false);
  });
});

describe("createRestaurantSchema", () => {
  const base = {
    name: "Sabores del Sur",
    slug: "sabores-del-sur",
    addressLine: "Av. España 1234",
    zoneId: "z1",
    phone: "",
    email: "",
    commission: "10",
    penalty: "0",
    refundsCommission: "on",
  };
  it("con usuario nuevo exige nombre, email y contraseña de 8+", () => {
    const ok = createRestaurantSchema.safeParse({
      ...base,
      ownerMode: "new",
      ownerName: "Laura",
      ownerEmail: "LAURA@Sabores.test ",
      ownerPassword: "inicial123",
    });
    expect(ok.success).toBe(true);
    if (ok.success && ok.data.ownerMode === "new") {
      expect(ok.data.ownerEmail).toBe("laura@sabores.test");
      expect(ok.data.commission).toBe(1000);
      expect(ok.data.phone).toBeUndefined();
      expect(ok.data.email).toBeUndefined();
    }
    const bad = createRestaurantSchema.safeParse({ ...base, ownerMode: "new", ownerName: "L", ownerEmail: "x", ownerPassword: "corta" });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      const paths = bad.error.issues.map((i) => i.path[0]);
      expect(paths).toEqual(expect.arrayContaining(["ownerName", "ownerEmail", "ownerPassword"]));
    }
  });
  it("con usuario existente solo pide el email", () => {
    expect(createRestaurantSchema.safeParse({ ...base, ownerMode: "existing", existingOwnerEmail: "rosa@prepago.test" }).success).toBe(true);
    expect(createRestaurantSchema.safeParse({ ...base, ownerMode: "existing", existingOwnerEmail: "" }).success).toBe(false);
  });
  it("rechaza teléfono y email del local inválidos", () => {
    const r = createRestaurantSchema.safeParse({
      ...base,
      phone: "abc",
      email: "no-es-email",
      ownerMode: "existing",
      existingOwnerEmail: "rosa@prepago.test",
    });
    expect(r.success).toBe(false);
  });
});

describe("statusChangeSchema", () => {
  it("solo estados válidos; motivo opcional", () => {
    expect(statusChangeSchema.safeParse({ restaurantId: "r", status: "SUSPENDED", reason: "" }).success).toBe(true);
    expect(statusChangeSchema.safeParse({ restaurantId: "r", status: "BORRADO" }).success).toBe(false);
  });
});
