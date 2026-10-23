import { describe, expect, it } from "vitest";
import { assertBalanced } from "@/modules/wallet/entries";
import { claimRefundEntries, isClaimClosed, maxClaimRefund, parseGs, resolveClaimSchema } from "./rules";

describe("claimRefundEntries", () => {
  it("lo absorbe el restaurante: débito a su cuenta a pagar, crédito a la billetera", () => {
    const e = claimRefundEntries({ userId: "u1", restaurantId: "r1", amount: 30000, absorbedBy: "RESTAURANT" });
    expect(e).toEqual([
      { account: "wallet:u1", amount: -30000 },
      { account: "restaurant:r1", amount: 30000 },
    ]);
    expect(() => assertBalanced(e)).not.toThrow();
  });
  it("lo absorbe la plataforma: gasto de goodwill", () => {
    const e = claimRefundEntries({ userId: "u1", restaurantId: "r1", amount: 5000, absorbedBy: "PLATFORM" });
    expect(e).toEqual([
      { account: "wallet:u1", amount: -5000 },
      { account: "platform:goodwill", amount: 5000 },
    ]);
  });
  it("rechaza montos no positivos o con decimales", () => {
    expect(() => claimRefundEntries({ userId: "u", restaurantId: "r", amount: 0, absorbedBy: "PLATFORM" })).toThrow();
    expect(() => claimRefundEntries({ userId: "u", restaurantId: "r", amount: 10.5, absorbedBy: "PLATFORM" })).toThrow();
  });
});

describe("maxClaimRefund", () => {
  it("no permite devolver más que el total menos lo ya reembolsado", () => {
    expect(maxClaimRefund(50000, 0)).toBe(50000);
    expect(maxClaimRefund(50000, 20000)).toBe(30000);
    expect(maxClaimRefund(50000, 50000)).toBe(0);
    expect(maxClaimRefund(50000, 60000)).toBe(0);
  });
});

describe("estados", () => {
  it("resuelto y rechazado están cerrados", () => {
    expect(isClaimClosed("RESOLVED")).toBe(true);
    expect(isClaimClosed("REJECTED")).toBe(true);
    expect(isClaimClosed("OPEN")).toBe(false);
    expect(isClaimClosed("IN_REVIEW")).toBe(false);
  });
});

describe("parseGs", () => {
  it("acepta separador de miles y prefijo Gs.", () => {
    expect(parseGs("45.000")).toBe(45000);
    expect(parseGs("Gs. 45.000")).toBe(45000);
    expect(parseGs("")).toBe(0);
    expect(parseGs("12,5")).toBeNull();
    expect(parseGs("-3")).toBeNull();
  });
});

describe("resolveClaimSchema", () => {
  const base = { claimId: "c1", resolution: "Se verificó el problema" };
  it("resolver con reembolso exige quién lo absorbe", () => {
    expect(resolveClaimSchema.safeParse({ ...base, decision: "RESOLVE", refundAmount: "10.000" }).success).toBe(false);
    const ok = resolveClaimSchema.safeParse({ ...base, decision: "RESOLVE", refundAmount: "10.000", absorbedBy: "RESTAURANT" });
    expect(ok.success && ok.data.refundAmount).toBe(10000);
  });
  it("resolver sin reembolso es válido", () => {
    const ok = resolveClaimSchema.safeParse({ ...base, decision: "RESOLVE", refundAmount: "" });
    expect(ok.success && ok.data.refundAmount).toBe(0);
  });
  it("rechazar no admite reembolso y exige explicación", () => {
    expect(resolveClaimSchema.safeParse({ ...base, decision: "REJECT", refundAmount: "1000", absorbedBy: "PLATFORM" }).success).toBe(false);
    expect(resolveClaimSchema.safeParse({ claimId: "c1", decision: "REJECT", resolution: "no" }).success).toBe(false);
    expect(resolveClaimSchema.safeParse({ ...base, decision: "REJECT" }).success).toBe(true);
  });
});
