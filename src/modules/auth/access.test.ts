import { describe, expect, it } from "vitest";
import { decideAccess, homeForRole, safeCallbackUrl } from "./access";

describe("decideAccess", () => {
  it("las rutas públicas no requieren sesión", () => {
    expect(decideAccess("/", null)).toEqual({ allow: true });
    expect(decideAccess("/restaurantes/la-cocina", null)).toEqual({ allow: true });
  });

  it("sin sesión manda a ingresar con callbackUrl", () => {
    expect(decideAccess("/cuenta/billetera", null)).toEqual({
      allow: false,
      redirectTo: "/ingresar?callbackUrl=%2Fcuenta%2Fbilletera",
    });
  });

  it("cada rol solo entra a su área", () => {
    expect(decideAccess("/admin", "CUSTOMER")).toEqual({ allow: false, redirectTo: "/" });
    expect(decideAccess("/panel", "CUSTOMER")).toEqual({ allow: false, redirectTo: "/" });
    expect(decideAccess("/admin", "RESTAURANT_ADMIN")).toEqual({ allow: false, redirectTo: "/panel" });
    expect(decideAccess("/panel/menu", "RESTAURANT_ADMIN")).toEqual({ allow: true });
    expect(decideAccess("/admin/restaurantes", "SUPER_ADMIN")).toEqual({ allow: true });
  });

  it("no confunde prefijos parecidos", () => {
    expect(decideAccess("/administracion-publica", null)).toEqual({ allow: true });
  });

  it("inicio por rol", () => {
    expect(homeForRole("CUSTOMER")).toBe("/");
    expect(homeForRole("RESTAURANT_ADMIN")).toBe("/panel");
    expect(homeForRole("SUPER_ADMIN")).toBe("/admin");
  });
});

describe("safeCallbackUrl", () => {
  it("solo acepta rutas internas", () => {
    expect(safeCallbackUrl("/cuenta")).toBe("/cuenta");
    expect(safeCallbackUrl("//evil.com")).toBeNull();
    expect(safeCallbackUrl("/\\evil.com")).toBeNull();
    expect(safeCallbackUrl("https://evil.com")).toBeNull();
    expect(safeCallbackUrl(undefined)).toBeNull();
  });
});
