import { describe, expect, it } from "vitest";
import { isAuthorizedCron, isSameOriginJson, safeInternalPath } from "./http";

describe("isAuthorizedCron", () => {
  it("exige el Bearer exacto y un secreto configurado", () => {
    expect(isAuthorizedCron("Bearer s3cr3t", "s3cr3t")).toBe(true);
    expect(isAuthorizedCron("Bearer otro", "s3cr3t")).toBe(false);
    expect(isAuthorizedCron(null, "s3cr3t")).toBe(false);
    expect(isAuthorizedCron("Bearer ", "")).toBe(false);
    expect(isAuthorizedCron("Bearer undefined", undefined)).toBe(false);
  });
});

describe("isSameOriginJson", () => {
  const url = "https://app.test/api/push/suscribir";
  it("acepta JSON del mismo origen", () => {
    const h = new Headers({ "content-type": "application/json", origin: "https://app.test", host: "app.test" });
    expect(isSameOriginJson(h, url)).toBe(true);
  });
  it("rechaza otros orígenes y otros content-type", () => {
    expect(
      isSameOriginJson(new Headers({ "content-type": "application/json", origin: "https://malo.test", host: "app.test" }), url),
    ).toBe(false);
    expect(isSameOriginJson(new Headers({ "content-type": "text/plain", host: "app.test" }), url)).toBe(false);
  });
});

describe("safeInternalPath", () => {
  it("solo rutas internas", () => {
    expect(safeInternalPath("/cuenta/pedidos/A")).toBe("/cuenta/pedidos/A");
    expect(safeInternalPath("//malo.test")).toBe("/cuenta/notificaciones");
    expect(safeInternalPath("https://malo.test")).toBe("/cuenta/notificaciones");
    expect(safeInternalPath(undefined, "/x")).toBe("/x");
  });
});
