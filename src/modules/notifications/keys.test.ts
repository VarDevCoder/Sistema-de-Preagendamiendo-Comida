import { describe, expect, it } from "vitest";
import { dedupeKey, eventKey } from "./keys";

describe("eventKey / dedupeKey", () => {
  it("es determinística por hecho y canal", () => {
    const key = eventKey({ type: "ORDER_CONFIRMED", orderId: "o1" });
    expect(key).toBe("ORDER_CONFIRMED:o1");
    expect(dedupeKey(key, "EMAIL")).toBe("ORDER_CONFIRMED:o1:EMAIL");
    expect(eventKey({ type: "ORDER_CONFIRMED", orderId: "o1" })).toBe(key);
  });

  it("recordatorio: uno por pedido", () => {
    expect(dedupeKey(eventKey({ type: "ORDER_REMINDER", orderId: "o9" }), "PUSH")).toBe("ORDER_REMINDER:o9:PUSH");
  });

  it("cada canal tiene su propia clave", () => {
    const key = eventKey({ type: "ORDER_READY", orderId: "o1" });
    const keys = (["IN_APP", "EMAIL", "PUSH"] as const).map((c) => dedupeKey(key, c));
    expect(new Set(keys).size).toBe(3);
  });

  it("saldo acreditado se identifica por la transacción del ledger", () => {
    expect(eventKey({ type: "WALLET_CREDITED", userId: "u", amount: 100, ledgerTransactionId: "tx1" })).toBe(
      "WALLET_CREDITED:tx1",
    );
  });

  it("cambio de día del plan: un aviso por cada cambio", () => {
    const e = { type: "PLAN_DAY_CHANGED", orderId: "o1" } as const;
    expect(eventKey(e, { orderChangeId: "c1" })).toBe("PLAN_DAY_CHANGED:o1:c1");
    expect(eventKey(e, { orderChangeId: "c2" })).not.toBe(eventKey(e, { orderChangeId: "c1" }));
    expect(eventKey(e, { orderVersion: 123 })).toBe("PLAN_DAY_CHANGED:o1:v123");
  });

  it("reclamo: un aviso por estado", () => {
    const e = { type: "CLAIM_UPDATED", claimId: "cl1" } as const;
    expect(eventKey(e, { claimStatus: "IN_REVIEW" })).toBe("CLAIM_UPDATED:cl1:IN_REVIEW");
    expect(eventKey(e, { claimStatus: "RESOLVED" })).toBe("CLAIM_UPDATED:cl1:RESOLVED");
  });
});
