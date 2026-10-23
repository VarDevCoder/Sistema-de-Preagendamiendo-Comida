import { describe, expect, it } from "vitest";
import { selectChannels } from "./channels";

const base = { userActive: true, email: "ana@prepago.test", emailEnabled: true, pushEnabled: true, pushSubscriptions: 2 };

describe("selectChannels", () => {
  it("todos los canales cuando hay proveedor, email y dispositivos", () => {
    expect(selectChannels(base)).toEqual(["IN_APP", "EMAIL", "PUSH"]);
  });
  it("IN_APP siempre", () => {
    expect(selectChannels({ ...base, emailEnabled: false, pushEnabled: false })).toEqual(["IN_APP"]);
  });
  it("sin proveedor de email no hay EMAIL", () => {
    expect(selectChannels({ ...base, emailEnabled: false })).toEqual(["IN_APP", "PUSH"]);
  });
  it("sin VAPID o sin dispositivos suscriptos no hay PUSH", () => {
    expect(selectChannels({ ...base, pushEnabled: false })).toEqual(["IN_APP", "EMAIL"]);
    expect(selectChannels({ ...base, pushSubscriptions: 0 })).toEqual(["IN_APP", "EMAIL"]);
  });
  it("usuario desactivado: solo la bandeja", () => {
    expect(selectChannels({ ...base, userActive: false })).toEqual(["IN_APP"]);
  });
});
