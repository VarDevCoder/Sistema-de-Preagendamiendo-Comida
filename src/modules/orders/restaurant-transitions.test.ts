import { describe, expect, it } from "vitest";
import type { OrderStatus } from "@/generated/prisma/enums";
import {
  canAdvance,
  canRestaurantCancel,
  decideAdvance,
  nextKitchenStatus,
  timestampFieldFor,
} from "./restaurant-transitions";
import { cancelSchema } from "./restaurant-schemas";

const ALL: OrderStatus[] = [
  "PENDING_PAYMENT",
  "CONFIRMED",
  "IN_PREPARATION",
  "READY",
  "DELIVERED",
  "CANCELLED_BY_RESTAURANT",
  "CANCELLED_BY_CUSTOMER",
  "EXPIRED",
  "PAYMENT_FAILED",
];

describe("transiciones de cocina", () => {
  it("solo permite avanzar un paso: confirmado → en preparación → listo → entregado", () => {
    const valid = ALL.flatMap((from) => ALL.filter((to) => canAdvance(from, to)).map((to) => `${from}>${to}`));
    expect(valid).toEqual(["CONFIRMED>IN_PREPARATION", "IN_PREPARATION>READY", "READY>DELIVERED"]);
  });

  it("siguiente estado", () => {
    expect(nextKitchenStatus("CONFIRMED")).toBe("IN_PREPARATION");
    expect(nextKitchenStatus("READY")).toBe("DELIVERED");
    expect(nextKitchenStatus("DELIVERED")).toBeNull();
    expect(nextKitchenStatus("PENDING_PAYMENT")).toBeNull();
    expect(nextKitchenStatus("CANCELLED_BY_RESTAURANT")).toBeNull();
  });

  it("no se puede saltar ni retroceder", () => {
    expect(canAdvance("CONFIRMED", "READY")).toBe(false);
    expect(canAdvance("READY", "IN_PREPARATION")).toBe(false);
    expect(canAdvance("CANCELLED_BY_CUSTOMER", "IN_PREPARATION")).toBe(false);
  });

  it("timestamps por estado", () => {
    expect(timestampFieldFor("IN_PREPARATION")).toBe("inPreparationAt");
    expect(timestampFieldFor("READY")).toBe("readyAt");
    expect(timestampFieldFor("DELIVERED")).toBe("deliveredAt");
  });

  it("decideAdvance: repetir es no-op, futuro no se prepara, inválidas fallan", () => {
    const today = "2026-10-22";
    expect(decideAdvance({ from: "READY", to: "READY", serviceDate: today, today })).toEqual({ ok: true, noop: true });
    expect(decideAdvance({ from: "CONFIRMED", to: "IN_PREPARATION", serviceDate: today, today })).toEqual({ ok: true, noop: false });
    expect(decideAdvance({ from: "CONFIRMED", to: "IN_PREPARATION", serviceDate: "2026-10-21", today }).ok).toBe(true);
    expect(decideAdvance({ from: "CONFIRMED", to: "IN_PREPARATION", serviceDate: "2026-10-23", today }).ok).toBe(false);
    expect(decideAdvance({ from: "CONFIRMED", to: "DELIVERED", serviceDate: today, today }).ok).toBe(false);
    expect(decideAdvance({ from: "CANCELLED_BY_RESTAURANT", to: "READY", serviceDate: today, today }).ok).toBe(false);
  });
});

describe("cancelación por el restaurante", () => {
  it("solo desde confirmado, en preparación o listo", () => {
    expect(ALL.filter(canRestaurantCancel)).toEqual(["CONFIRMED", "IN_PREPARATION", "READY"]);
  });

  it("el motivo es obligatorio", () => {
    expect(cancelSchema.safeParse({ slug: "rosa", orderId: "o1", reason: "   " }).success).toBe(false);
    expect(cancelSchema.safeParse({ slug: "rosa", orderId: "o1", reason: "abc" }).success).toBe(false);
    const ok = cancelSchema.safeParse({ slug: "rosa", orderId: "o1", reason: "  Corte de luz  " });
    expect(ok.success && ok.data.reason).toBe("Corte de luz");
  });
});
