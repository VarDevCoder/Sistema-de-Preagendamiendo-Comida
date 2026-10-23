import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { BASE_PRICE, EXTRA_PRICE, checkoutInput, createFixture, fundWallet, race, walletBalance } from "@/test/integration/fixtures";
import { placeOrder } from "./checkout";

// Concurrencia real contra Postgres: N clientes compiten por el último lugar.
const N = 8;

describe("checkout · reserva con bloqueos", () => {
  it("(a) N clientes por el último cupo de una franja → exactamente 1 gana", async () => {
    const f = await createFixture({ slotCapacity: 1, customers: N });
    const results = await race(N, (i) => placeOrder(f.customers[i].id, checkoutInput(f)));
    const ok = results.filter((r) => r.ok);
    expect(ok).toHaveLength(1);
    for (const r of results.filter((r) => !r.ok)) expect(r.ok ? "" : r.error).toMatch(/Se llenó la franja de las 12:00/);
    expect(await db.order.count({ where: { slotId: f.slot.id } })).toBe(1);
  });

  it("(b) N clientes por el último plato en stock → exactamente 1 gana", async () => {
    const f = await createFixture({ dishStock: 1, customers: N });
    const results = await race(N, (i) => placeOrder(f.customers[i].id, checkoutInput(f)));
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    for (const r of results.filter((r) => !r.ok)) expect(r.ok ? "" : r.error).toMatch(/Se agotó "Milanesa test"/);
  });

  it("(b') con cantidad: si quedan 2 y piden 3, el mensaje dice cuántos quedan", async () => {
    const f = await createFixture({ dishStock: 2, customers: 1 });
    const r = await placeOrder(f.customers[0].id, checkoutInput(f, { items: [{ dishId: f.dish.id, optionIds: [], quantity: 3 }] }));
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.error).toBe('Quedan solo 2 de "Milanesa test" para ese día.');
  });

  it("(c) N clientes por la última unidad de una opción con stock diario → exactamente 1 gana", async () => {
    const f = await createFixture({ optionStock: 1, customers: N });
    const results = await race(N, (i) =>
      placeOrder(f.customers[i].id, checkoutInput(f, { items: [{ dishId: f.dish.id, optionIds: [f.extra.id], quantity: 1 }] })),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    for (const r of results.filter((r) => !r.ok)) expect(r.ok ? "" : r.error).toMatch(/Se agotó "Extra queso"/);
    // Sin la opción limitada se puede seguir pidiendo.
    const plain = await placeOrder(f.customers[1].id, checkoutInput(f));
    expect(plain.ok).toBe(true);
  });

  it("(d) una reserva vencida no ocupa cupo (sin cron)", async () => {
    const f = await createFixture({ slotCapacity: 1, customers: 2 });
    const first = await placeOrder(f.customers[0].id, checkoutInput(f));
    expect(first.ok && first.status).toBe("PENDING_PAYMENT");
    const blocked = await placeOrder(f.customers[1].id, checkoutInput(f));
    expect(blocked.ok).toBe(false);
    // Vence la reserva del primero (el cron NO corrió: sigue PENDING_PAYMENT).
    await db.order.update({ where: { id: first.ok ? first.orderId : "" }, data: { holdExpiresAt: new Date(Date.now() - 60_000) } });
    const second = await placeOrder(f.customers[1].id, checkoutInput(f));
    expect(second.ok).toBe(true);
  });

  it("(g) el precio guardado lo calcula el servidor aunque el cliente mande otro", async () => {
    const f = await createFixture();
    const tampered = checkoutInput(f, {
      total: 1,
      itemsSubtotal: 1,
      discountBps: 9000,
      items: [{ dishId: f.dish.id, optionIds: [f.extra.id], quantity: 2, unitPrice: 1, lineTotal: 1, kcal: 1 }],
    });
    const r = await placeOrder(f.customers[0].id, tampered);
    expect(r.ok).toBe(true);
    const order = await db.order.findUniqueOrThrow({ where: { id: r.ok ? r.orderId : "" }, include: { items: { include: { modifiers: true } } } });
    const unit = BASE_PRICE + EXTRA_PRICE;
    expect(order.items[0].unitListPrice).toBe(unit);
    expect(order.itemsSubtotal).toBe(unit * 2);
    expect(order.discountBps).toBe(1000); // escalón 24 h del restaurante (la franja es en 3 días)
    expect(order.discountAmount).toBe(Math.round(unit * 2 * 0.1));
    expect(order.total).toBe(unit * 2 - order.discountAmount);
    expect(order.commissionAmount).toBe(Math.round(order.total * 0.1));
    // Macros también del servidor: 700 + 100 por unidad.
    expect(order.items[0].kcal).toBe(800);
    expect(order.kcal).toBe(1600);
    expect(order.items[0].modifiers[0]).toMatchObject({ optionName: "Extra queso", priceDelta: EXTRA_PRICE });
    const payment = await db.payment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(payment.amount).toBe(order.total);
  });

  it("valida la selección contra el menú vigente (opción borrada, nota no permitida)", async () => {
    const f = await createFixture();
    await db.modifierOption.update({ where: { id: f.huevo.id }, data: { deletedAt: new Date() } });
    const r = await placeOrder(f.customers[0].id, checkoutInput(f, { items: [{ dishId: f.dish.id, optionIds: [f.huevo.id], quantity: 1 }] }));
    expect(r.ok ? "" : r.error).toMatch(/no existe para este plato/);
  });

  it("doble submit con el mismo checkoutKey devuelve el mismo pedido", async () => {
    const f = await createFixture();
    const input = checkoutInput(f);
    const [a, b] = await race(2, () => placeOrder(f.customers[0].id, input));
    expect(a.ok && b.ok).toBe(true);
    expect(a.ok && b.ok && a.orderId === b.orderId).toBe(true);
    expect(await db.order.count({ where: { checkoutKey: input.checkoutKey } })).toBe(1);
  });

  it("delivery: suma el envío de la zona y guarda la dirección", async () => {
    const f = await createFixture();
    const r = await placeOrder(f.customers[0].id, checkoutInput(f, { fulfillment: "DELIVERY", addressId: f.customers[0].addresses[0].id }));
    expect(r.ok).toBe(true);
    const order = await db.order.findUniqueOrThrow({ where: { id: r.ok ? r.orderId : "" } });
    expect(order.deliveryFee).toBe(7_000);
    expect(order.total).toBe(order.itemsSubtotal - order.discountAmount + 7_000);
    expect(order.deliveryAddress).toMatchObject({ street: "Calle 2" });
  });

  it("billetera que cubre todo: confirma en el acto con provider WALLET", async () => {
    const f = await createFixture();
    const user = f.customers[0].id;
    await fundWallet(user, 100_000);
    const r = await placeOrder(user, checkoutInput(f, { useWallet: true }));
    expect(r.ok && r.status).toBe("CONFIRMED");
    const order = await db.order.findUniqueOrThrow({ where: { id: r.ok ? r.orderId : "" }, include: { payments: true, ledgerTxs: true } });
    expect(order.payments[0]).toMatchObject({ provider: "WALLET", status: "APPROVED", walletAmount: order.total, gatewayAmount: 0 });
    expect(order.ledgerTxs.map((t) => t.type)).toEqual(["PAYMENT_CAPTURED"]);
    expect(await walletBalance(user)).toBe(100_000 - order.total);
  });
});
