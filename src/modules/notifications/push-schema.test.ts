import { describe, expect, it } from "vitest";
import { pushSubscriptionSchema, pushUnsubscribeSchema } from "./push-schema";

const valid = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  expirationTime: null,
  keys: {
    p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
    auth: "tBHItJI5svbpez7KI4CCXg",
  },
};

describe("pushSubscriptionSchema", () => {
  it("acepta el JSON de PushSubscription.toJSON()", () => {
    expect(pushSubscriptionSchema.safeParse(valid).success).toBe(true);
    const { expirationTime: _omit, ...withoutExpiration } = valid;
    void _omit;
    expect(pushSubscriptionSchema.safeParse(withoutExpiration).success).toBe(true);
  });
  it("rechaza endpoints que no son https", () => {
    expect(pushSubscriptionSchema.safeParse({ ...valid, endpoint: "http://fcm.googleapis.com/x" }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ ...valid, endpoint: "file:///etc/passwd" }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ ...valid, endpoint: "no-es-url" }).success).toBe(false);
  });
  it("exige claves base64url", () => {
    expect(pushSubscriptionSchema.safeParse({ ...valid, keys: { ...valid.keys, auth: "" } }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ ...valid, keys: { ...valid.keys, p256dh: "con espacios" } }).success).toBe(
      false,
    );
    expect(pushSubscriptionSchema.safeParse({ endpoint: valid.endpoint }).success).toBe(false);
  });
  it("rechaza bodies vacíos o de otro tipo", () => {
    expect(pushSubscriptionSchema.safeParse(null).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse("x").success).toBe(false);
  });
  it("desuscribir solo pide el endpoint", () => {
    expect(pushUnsubscribeSchema.safeParse({ endpoint: valid.endpoint }).success).toBe(true);
    expect(pushUnsubscribeSchema.safeParse({}).success).toBe(false);
  });
});
