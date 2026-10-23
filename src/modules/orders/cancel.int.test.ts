import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { processPaymentEvent } from "@/modules/payments/process";
import { approvedEvent, checkoutInput, createFixture, race, walletBalance } from "@/test/integration/fixtures";
import { cancelOrderByCustomer } from "./cancel";
import { placeOrder } from "./checkout";
import { expireStaleReservations } from "./expire";

describe("cancelación del cliente", () => {
  it("antes del corte: reembolsa el % del restaurante una sola vez (idempotente) y libera el cupo", async () => {
    const f = await createFixture({ slotCapacity: 1, customers: 2 });
    const r = await placeOrder(f.customers[0].id, checkoutInput(f));
    if (!r.ok) throw new Error(r.error);
    await processPaymentEvent("MOCK", await approvedEvent(r.orderId));
    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId } });

    const results = await race(3, () => cancelOrderByCustomer(f.customers[0].id, order.code));
    expect(results.every((x) => x.ok)).toBe(true);
    expect(results.filter((x) => x.ok && !x.alreadyCancelled)).toHaveLength(1);
    const refund = Math.round(order.total * 0.8);
    expect(await walletBalance(f.customers[0].id)).toBe(refund);
    expect(await db.ledgerTransaction.count({ where: { idempotencyKey: `order:${order.id}:customer-cancel` } })).toBe(1);
    expect((await placeOrder(f.customers[1].id, checkoutInput(f))).ok).toBe(true);
  });

  it("después del corte no se puede; tampoco un pedido ajeno", async () => {
    const f = await createFixture({ customers: 2 });
    const r = await placeOrder(f.customers[0].id, checkoutInput(f));
    if (!r.ok) throw new Error(r.error);
    await processPaymentEvent("MOCK", await approvedEvent(r.orderId));
    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId } });
    expect((await cancelOrderByCustomer(f.customers[1].id, order.code)).ok).toBe(false);
    const late = await cancelOrderByCustomer(f.customers[0].id, order.code, undefined, new Date(order.cutoffAt.getTime() + 1000));
    expect(late.ok ? "" : late.error).toMatch(/Ya pasó la hora de corte/);
  });
});

describe("cron de reservas vencidas", () => {
  it("pasa a EXPIRED los pendientes vencidos y es idempotente", async () => {
    const f = await createFixture();
    const r = await placeOrder(f.customers[0].id, checkoutInput(f));
    if (!r.ok) throw new Error(r.error);
    const past = new Date(Date.now() - 60_000);
    await db.order.update({ where: { id: r.orderId }, data: { holdExpiresAt: past } });
    await db.payment.updateMany({ where: { orderId: r.orderId }, data: { expiresAt: past } });
    const first = await expireStaleReservations();
    expect(first.expiredOrders).toBeGreaterThanOrEqual(1);
    const second = await expireStaleReservations();
    expect(second).toEqual({ expiredOrders: 0, expiredPayments: 0 });
    const saved = await db.order.findUniqueOrThrow({ where: { id: r.orderId }, include: { payments: true, events: true } });
    expect(saved.status).toBe("EXPIRED");
    expect(saved.payments[0].status).toBe("EXPIRED");
    expect(saved.events.filter((e) => e.toStatus === "EXPIRED")).toHaveLength(1);
  });
});
