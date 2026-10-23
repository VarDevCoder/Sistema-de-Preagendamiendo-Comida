import { describe, expect, it } from "vitest";
import { buildContent, type OrderInfo } from "./content";

const order: OrderInfo = {
  code: "K7P-4QX",
  restaurantName: "La Cocina de Doña Rosa",
  serviceDate: "2026-11-03", // martes
  slotStartMinute: 720,
  slotEndMinute: 750,
  fulfillment: "PICKUP",
  total: 45000,
};

describe("buildContent", () => {
  it("pedido confirmado: código, fecha, franja y total", () => {
    const c = buildContent({ type: "ORDER_CONFIRMED", order });
    expect(c.type).toBe("ORDER_CONFIRMED");
    expect(c.title).toBe("Pedido K7P-4QX confirmado");
    expect(c.body).toBe(
      "Tu pedido en La Cocina de Doña Rosa es para el martes 3 de noviembre, de 12:00 a 12:30 (para retirar). Total pagado: Gs. 45.000.",
    );
    expect(c.url).toBe("/cuenta/pedidos/K7P-4QX");
  });

  it("pedido confirmado con delivery", () => {
    const c = buildContent({ type: "ORDER_CONFIRMED", order: { ...order, fulfillment: "DELIVERY" } });
    expect(c.body).toContain("(con delivery)");
  });

  it("recordatorio: retiro y delivery", () => {
    expect(buildContent({ type: "ORDER_REMINDER", order }).body).toBe(
      "Recordatorio: mañana martes 3 de noviembre, de 12:00 a 12:30, retirás tu pedido K7P-4QX en La Cocina de Doña Rosa.",
    );
    const d = buildContent({ type: "ORDER_REMINDER", order: { ...order, fulfillment: "DELIVERY" } });
    expect(d.title).toBe("Mañana tenés pedido");
    expect(d.body).toContain("te llega tu pedido K7P-4QX de La Cocina de Doña Rosa");
  });

  it("pedido listo", () => {
    const c = buildContent({ type: "ORDER_READY", order });
    expect(c.title).toBe("¡Tu pedido K7P-4QX está listo!");
    expect(c.body).toBe("La Cocina de Doña Rosa terminó tu pedido. Ya podés pasar a retirarlo.");
  });

  it("cancelado por el restaurante: motivo y reembolso a la billetera", () => {
    const c = buildContent({
      type: "ORDER_CANCELLED",
      order,
      byRestaurant: true,
      reason: "Corte de luz en la cocina",
      refundAmount: 45000,
    });
    expect(c.title).toBe("Pedido K7P-4QX cancelado");
    expect(c.body).toBe(
      "La Cocina de Doña Rosa canceló tu pedido K7P-4QX del martes 3 de noviembre. Motivo: Corte de luz en la cocina. Te devolvimos Gs. 45.000 a tu billetera.",
    );
  });

  it("cancelado por el cliente sin reembolso no menciona la billetera", () => {
    const c = buildContent({ type: "ORDER_CANCELLED", order, byRestaurant: false, reason: "x", refundAmount: 0 });
    expect(c.body).toBe("Cancelaste tu pedido K7P-4QX en La Cocina de Doña Rosa del martes 3 de noviembre.");
  });

  it("plan confirmado", () => {
    const c = buildContent({
      type: "PLAN_CONFIRMED",
      plan: {
        code: "PLN-1",
        restaurantName: "Fit Bowl",
        periodStart: "2026-11-01",
        periodEnd: "2026-11-30",
        days: 20,
        total: 700000,
      },
    });
    expect(c.body).toBe("Tu plan en Fit Bowl del 1/11 al 30/11 está confirmado: 20 días, total Gs. 700.000.");
    expect(c.url).toBe("/cuenta/planes/PLN-1");
  });

  it("día del plan cambiado: crédito o cobro de la diferencia", () => {
    const credit = buildContent({ type: "PLAN_DAY_CHANGED", order, settlement: "WALLET_CREDIT", difference: -5000 });
    expect(credit.title).toBe("Cambiaste tu pedido del 3/11");
    expect(credit.body).toContain("Te acreditamos Gs. 5.000 en tu billetera.");
    const charged = buildContent({ type: "PLAN_DAY_CHANGED", order, settlement: "CHARGED", difference: 7000 });
    expect(charged.body).toContain("Pagaste la diferencia de Gs. 7.000.");
    const same = buildContent({ type: "PLAN_DAY_CHANGED", order, settlement: "NONE", difference: 0 });
    expect(same.body).not.toContain("Gs.");
  });

  it("saldo acreditado", () => {
    const c = buildContent({ type: "WALLET_CREDITED", amount: 8500 });
    expect(c.body).toBe("Recibiste Gs. 8.500 en tu billetera. Podés usarlo en cualquier restaurante.");
    expect(c.url).toBe("/cuenta/billetera");
  });

  it("reclamo actualizado según estado", () => {
    const claim = {
      orderCode: "K7P-4QX",
      restaurantName: "Fit Bowl",
      resolution: "Te pedimos disculpas.",
      refundAmount: 12000,
    };
    expect(buildContent({ type: "CLAIM_UPDATED", claim: { ...claim, status: "IN_REVIEW" } }).title).toBe(
      "Estamos revisando tu reclamo",
    );
    const resolved = buildContent({ type: "CLAIM_UPDATED", claim: { ...claim, status: "RESOLVED" } });
    expect(resolved.body).toBe(
      "Resolvimos tu reclamo por el pedido K7P-4QX (Fit Bowl). Te pedimos disculpas. Te devolvimos Gs. 12.000 a tu billetera.",
    );
    const rejected = buildContent({ type: "CLAIM_UPDATED", claim: { ...claim, status: "REJECTED", refundAmount: null } });
    expect(rejected.title).toBe("Tu reclamo fue rechazado");
    expect(rejected.body).not.toContain("billetera");
  });

  it("las URLs son siempre internas y escapan el código", () => {
    const c = buildContent({ type: "ORDER_READY", order: { ...order, code: "A/B" } });
    expect(c.url).toBe("/cuenta/pedidos/A%2FB");
  });
});
