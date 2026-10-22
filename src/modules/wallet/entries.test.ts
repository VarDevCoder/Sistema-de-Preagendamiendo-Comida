import { describe, expect, it } from "vitest";
import {
  assertBalanced,
  partialRefundEntries,
  paymentCapturedEntries,
  restaurantCancelEntries,
  reversalEntries,
  walletBalanceFromEntries,
  type Entry,
} from "./entries";

const sum = (e: Entry[]) => e.reduce((a, x) => a + x.amount, 0);
const amountOf = (e: Entry[], account: string) => e.find((x) => x.account === account)?.amount ?? 0;

describe("asientos de doble registro", () => {
  it("pago mixto tarjeta + billetera", () => {
    const e = paymentCapturedEntries({
      userId: "u1",
      restaurantId: "r1",
      gatewayAmount: 30_000,
      walletAmount: 20_000,
      commissionAmount: 5_000,
    });
    expect(sum(e)).toBe(0);
    expect(amountOf(e, "platform:gateway")).toBe(30_000);
    expect(amountOf(e, "wallet:u1")).toBe(20_000);
    expect(amountOf(e, "restaurant:r1")).toBe(-45_000);
    expect(amountOf(e, "platform:commission")).toBe(-5_000);
  });

  it("pago 100% con tarjeta no genera asiento de billetera", () => {
    const e = paymentCapturedEntries({
      userId: "u1",
      restaurantId: "r1",
      gatewayAmount: 50_000,
      walletAmount: 0,
      commissionAmount: 5_000,
    });
    expect(e.find((x) => x.account === "wallet:u1")).toBeUndefined();
  });

  it("cancelación del restaurante (por defecto): cliente 100%, se devuelve la comisión", () => {
    const e = restaurantCancelEntries({
      userId: "u1",
      restaurantId: "r1",
      total: 50_000,
      commissionAmount: 5_000,
      refundsCommission: true,
      penaltyBps: 0,
    });
    expect(sum(e)).toBe(0);
    expect(walletBalanceFromEntries([amountOf(e, "wallet:u1")])).toBe(50_000);
    expect(amountOf(e, "restaurant:r1")).toBe(45_000);
    expect(amountOf(e, "platform:commission")).toBe(5_000);
  });

  it("cancelación del restaurante con comisión absorbida y penalidad del 5%", () => {
    const e = restaurantCancelEntries({
      userId: "u1",
      restaurantId: "r1",
      total: 50_000,
      commissionAmount: 5_000,
      refundsCommission: false,
      penaltyBps: 500,
    });
    expect(sum(e)).toBe(0);
    expect(amountOf(e, "wallet:u1")).toBe(-50_000);
    expect(amountOf(e, "restaurant:r1")).toBe(52_500);
    expect(amountOf(e, "platform:penalty")).toBe(-2_500);
    expect(amountOf(e, "platform:commission")).toBe(0);
  });

  it("reembolso parcial devuelve la comisión proporcional", () => {
    const e = partialRefundEntries({
      userId: "u1",
      restaurantId: "r1",
      total: 40_000,
      commissionAmount: 4_000,
      refundAmount: 20_000,
    });
    expect(sum(e)).toBe(0);
    expect(amountOf(e, "platform:commission")).toBe(2_000);
    expect(amountOf(e, "restaurant:r1")).toBe(18_000);
  });

  it("el inverso anula la transacción original", () => {
    const original = paymentCapturedEntries({
      userId: "u1",
      restaurantId: "r1",
      gatewayAmount: 10_000,
      walletAmount: 0,
      commissionAmount: 1_000,
    });
    const rev = reversalEntries(original);
    expect(sum([...original, ...rev])).toBe(0);
  });

  it("rechaza transacciones desbalanceadas o con un solo asiento", () => {
    expect(() => assertBalanced([{ account: "a", amount: 10 }, { account: "b", amount: -9 }])).toThrow();
    expect(() => assertBalanced([{ account: "a", amount: 0 }, { account: "b", amount: 0 }])).toThrow();
    expect(() => assertBalanced([{ account: "a", amount: 10 }])).toThrow();
  });
});
