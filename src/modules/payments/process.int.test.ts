import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { POST as webhookPOST } from "@/app/api/pagos/webhook/[provider]/route";
import { placeOrder } from "@/modules/orders/checkout";
import { approvedEvent, checkoutInput, createFixture, fundWallet, paymentOf, race, rejectedEvent, walletBalance } from "@/test/integration/fixtures";
import { buildMockEvent, signMockEvent } from "./mock";
import { processPaymentEvent } from "./process";

async function pendingOrder(f: Awaited<ReturnType<typeof createFixture>>, customer = 0, over: Record<string, unknown> = {}) {
  const r = await placeOrder(f.customers[customer].id, checkoutInput(f, over));
  if (!r.ok) throw new Error(r.error);
  return r;
}

function webhookRequest(body: string, headers: Record<string, string>) {
  return new NextRequest("http://localhost/api/pagos/webhook/mock", { method: "POST", body, headers });
}

describe("webhook de pagos", () => {
  it("(e) el mismo webhook dos veces (secuencial y concurrente) no duplica confirmación ni asientos", async () => {
    const f = await createFixture();
    const order = await pendingOrder(f);
    const event = await approvedEvent(order.orderId);

    const concurrent = await race(4, () => processPaymentEvent("MOCK", event));
    expect(concurrent.map((r) => r.outcome).sort()).toEqual(["CONFIRMED", "DUPLICATE", "DUPLICATE", "DUPLICATE"]);
    expect((await processPaymentEvent("MOCK", event)).outcome).toBe("DUPLICATE");
    // Otro evento (id distinto) que vuelve a aprobar el mismo pago: sin efecto.
    expect((await processPaymentEvent("MOCK", await approvedEvent(order.orderId))).outcome).toBe("ALREADY_FINAL");

    const payment = await paymentOf(order.orderId);
    const saved = await db.order.findUniqueOrThrow({ where: { id: order.orderId }, include: { events: true } });
    expect(saved.status).toBe("CONFIRMED");
    expect(saved.events.filter((e) => e.toStatus === "CONFIRMED")).toHaveLength(1);
    expect(payment.status).toBe("APPROVED");
    expect(await db.ledgerTransaction.count({ where: { paymentId: payment.id } })).toBe(1);
    expect(await db.ledgerTransaction.count({ where: { idempotencyKey: `payment:${payment.id}:captured` } })).toBe(1);
    expect(await db.paymentWebhookEvent.count({ where: { paymentId: payment.id } })).toBe(2);
  });

  it("la ruta verifica la firma HMAC y responde 200 a un evento repetido", async () => {
    const f = await createFixture();
    const order = await pendingOrder(f);
    const p = await paymentOf(order.orderId);
    const event = buildMockEvent({ providerRef: p.providerRef!, type: "payment.approved", amount: p.gatewayAmount });
    const { body, headers } = signMockEvent("test-webhook-secret", event);
    const ctx = { params: Promise.resolve({ provider: "mock" }) };

    const forged = await webhookPOST(webhookRequest(body, { ...headers, "x-mock-signature": "sha256=deadbeef" }), ctx);
    expect(forged.status).toBe(401);
    const tampered = await webhookPOST(webhookRequest(body.replace(String(p.gatewayAmount), "1"), headers), ctx);
    expect(tampered.status).toBe(401);

    const first = await webhookPOST(webhookRequest(body, headers), ctx);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ outcome: "CONFIRMED" });
    const again = await webhookPOST(webhookRequest(body, headers), ctx);
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ outcome: "DUPLICATE" });
  });

  it("rechazo → PAYMENT_FAILED y libera el cupo", async () => {
    const f = await createFixture({ slotCapacity: 1, customers: 2 });
    const order = await pendingOrder(f);
    expect((await placeOrder(f.customers[1].id, checkoutInput(f))).ok).toBe(false);
    expect((await processPaymentEvent("MOCK", await rejectedEvent(order.orderId))).outcome).toBe("REJECTED");
    expect((await db.order.findUniqueOrThrow({ where: { id: order.orderId } })).status).toBe("PAYMENT_FAILED");
    expect((await placeOrder(f.customers[1].id, checkoutInput(f))).ok).toBe(true);
    // Un aprobado tardío del pago rechazado no confirma: acredita lo cobrado.
    const late = await processPaymentEvent("MOCK", await approvedEvent(order.orderId));
    expect(late.outcome).toBe("REFUNDED_NOT_PAYABLE");
  });

  it("monto distinto al esperado: no confirma", async () => {
    const f = await createFixture();
    const order = await pendingOrder(f);
    const event = { ...(await approvedEvent(order.orderId)), amount: 1 };
    expect((await processPaymentEvent("MOCK", event)).outcome).toBe("AMOUNT_MISMATCH");
    expect((await db.order.findUniqueOrThrow({ where: { id: order.orderId } })).status).toBe("PENDING_PAYMENT");
  });

  it("aprobación tardía con la reserva vencida: confirma si todavía hay lugar", async () => {
    const f = await createFixture({ slotCapacity: 1 });
    const order = await pendingOrder(f);
    await db.order.update({ where: { id: order.orderId }, data: { holdExpiresAt: new Date(Date.now() - 60_000) } });
    expect((await processPaymentEvent("MOCK", await approvedEvent(order.orderId))).outcome).toBe("CONFIRMED");
  });

  it("aprobación tardía sin lugar: pago aprobado + todo a la billetera + pedido vencido", async () => {
    const f = await createFixture({ slotCapacity: 1, customers: 2 });
    const order = await pendingOrder(f);
    await db.order.update({ where: { id: order.orderId }, data: { holdExpiresAt: new Date(Date.now() - 60_000) } });
    const other = await pendingOrder(f, 1); // toma el lugar liberado
    expect(other.ok).toBe(true);
    const res = await processPaymentEvent("MOCK", await approvedEvent(order.orderId));
    expect(res.outcome).toBe("REFUNDED_NO_ROOM");
    expect(res.message).toMatch(/Se llenó la franja de las 12:00/);
    const saved = await db.order.findUniqueOrThrow({ where: { id: order.orderId }, include: { payments: true } });
    expect(saved.status).toBe("EXPIRED");
    expect(saved.cancelReason).toMatch(/Te acreditamos/);
    expect(saved.payments[0].status).toBe("APPROVED");
    expect(await walletBalance(f.customers[0].id)).toBe(saved.payments[0].gatewayAmount);
    expect(await db.order.count({ where: { slotId: f.slot.id, status: "CONFIRMED" } })).toBe(0);
  });
});

describe("billetera", () => {
  it("(f) pagos simultáneos con billetera nunca dejan el saldo negativo", async () => {
    const f = await createFixture({ customers: 1 });
    const user = f.customers[0].id;
    await fundWallet(user, 50_000); // alcanza para 1 pedido (36.000) y parte de otro
    const results = await race(5, () => placeOrder(user, checkoutInput(f, { useWallet: true })));
    expect(results.every((r) => r.ok)).toBe(true);
    const confirmed = results.filter((r) => r.ok && r.status === "CONFIRMED");
    expect(confirmed).toHaveLength(1);

    const pendingIds = results.filter((r) => r.ok && r.status === "PENDING_PAYMENT").map((r) => (r.ok ? r.orderId : ""));
    const payments = await db.payment.findMany({ where: { orderId: { in: pendingIds } } });
    expect(payments.reduce((a, p) => a + p.walletAmount, 0)).toBe(50_000 - 36_000); // solo el resto, una vez
    // Aprobar todos a la vez.
    const events = await Promise.all(pendingIds.map((id) => approvedEvent(id)));
    const outcomes = await Promise.all(events.map((e) => processPaymentEvent("MOCK", e)));
    expect(outcomes.every((o) => o.outcome === "CONFIRMED")).toBe(true);
    expect(await walletBalance(user)).toBe(0);
  });

  it("(f') si al aprobar el saldo ya no alcanza, se rechaza con mensaje y lo cobrado vuelve a la billetera", async () => {
    const f = await createFixture({ customers: 1 });
    const user = f.customers[0].id;
    await fundWallet(user, 40_000);
    // A: 2 milanesas (72.000) → 40.000 billetera + 32.000 pasarela, pendiente.
    const a = await pendingOrder(f, 0, { useWallet: true, items: [{ dishId: f.dish.id, optionIds: [], quantity: 2 }] });
    const pa = await paymentOf(a.orderId);
    expect(pa).toMatchObject({ walletAmount: 40_000, gatewayAmount: 32_000 });
    // La reserva de A vence; mientras tanto B gasta el saldo pagando 100% con billetera.
    await db.payment.update({ where: { id: pa.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await db.order.update({ where: { id: a.orderId }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    const b = await placeOrder(user, checkoutInput(f, { useWallet: true }));
    expect(b.ok && b.status).toBe("CONFIRMED");
    expect(await walletBalance(user)).toBe(4_000);

    const res = await processPaymentEvent("MOCK", await approvedEvent(a.orderId));
    expect(res.outcome).toBe("REFUNDED_WALLET_SHORT");
    expect(res.message).toMatch(/saldo en la billetera ya no alcanzaba/);
    const saved = await db.order.findUniqueOrThrow({ where: { id: a.orderId } });
    expect(saved.status).toBe("PAYMENT_FAILED");
    expect(await walletBalance(user)).toBe(4_000 + 32_000);
  });

  it("ledger balanceado después de todo", async () => {
    const agg = await db.ledgerEntry.aggregate({ _sum: { amount: true } });
    expect(agg._sum.amount).toBe(0);
  });
});
