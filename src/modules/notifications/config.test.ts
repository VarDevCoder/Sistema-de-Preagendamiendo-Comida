import { describe, expect, it } from "vitest";
import { appBaseUrl, emailProviderName, vapidConfig } from "./config";
import { ConsoleEmailProvider, getEmailProvider, ResendEmailProvider } from "./email/providers";
import { getPushSender } from "./push/sender";

describe("configuración de proveedores", () => {
  it("email: consola en desarrollo, nada en producción sin claves, Resend con claves", () => {
    expect(emailProviderName({ NODE_ENV: "development" })).toBe("console");
    expect(emailProviderName({ NODE_ENV: "production" })).toBe("none");
    expect(emailProviderName({ NODE_ENV: "production", RESEND_API_KEY: "re_x", EMAIL_FROM: "a@b.c" })).toBe("resend");
    expect(emailProviderName({ NODE_ENV: "production", EMAIL_PROVIDER: "console" })).toBe("console");
    expect(getEmailProvider({ NODE_ENV: "development" })).toBeInstanceOf(ConsoleEmailProvider);
    expect(getEmailProvider({ NODE_ENV: "production" })).toBeNull();
    expect(getEmailProvider({ RESEND_API_KEY: "re_x", EMAIL_FROM: "a@b.c" })).toBeInstanceOf(ResendEmailProvider);
  });

  it("push deshabilitado si falta cualquier clave VAPID", () => {
    const full = { VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv", VAPID_SUBJECT: "mailto:a@b.c" };
    expect(vapidConfig(full)).toEqual({ publicKey: "pub", privateKey: "priv", subject: "mailto:a@b.c" });
    expect(vapidConfig({ ...full, VAPID_PUBLIC_KEY: undefined, NEXT_PUBLIC_VAPID_PUBLIC_KEY: "pub2" })?.publicKey).toBe(
      "pub2",
    );
    expect(vapidConfig({ ...full, VAPID_PRIVATE_KEY: "" })).toBeNull();
    expect(getPushSender({})).toBeNull();
    expect(getPushSender(full)).not.toBeNull();
  });

  it("URL base para los links de los emails", () => {
    expect(appBaseUrl({ NEXT_PUBLIC_APP_URL: "https://prepago.com.py/" })).toBe("https://prepago.com.py");
    expect(appBaseUrl({ VERCEL_PROJECT_PRODUCTION_URL: "prepago.vercel.app" })).toBe("https://prepago.vercel.app");
  });
});
