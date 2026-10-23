import { describe, expect, it, vi } from "vitest";
import type { NotificationChannel } from "@/generated/prisma/enums";
import { buildContent } from "./content";
import type { EmailProvider } from "./email/providers";
import { createNotifier, type NewNotificationRow, type NotificationStore, type ResolvedNotification } from "./notifier";
import type { PushResult, PushSender, PushTarget } from "./push/sender";

type Row = NewNotificationRow & { id: string; error?: string };

function memoryStore(subs: PushTarget[] = []) {
  const rows: Row[] = [];
  const pushSubs = [...subs];
  const store: NotificationStore = {
    countPushSubscriptions: async () => pushSubs.length,
    listPushSubscriptions: async () => [...pushSubs],
    deletePushSubscription: async (endpoint) => {
      const i = pushSubs.findIndex((s) => s.endpoint === endpoint);
      if (i >= 0) pushSubs.splice(i, 1);
    },
    insertNew: async (newRows) => {
      const created: { id: string; channel: NotificationChannel }[] = [];
      for (const r of newRows) {
        if (rows.some((x) => x.dedupeKey === r.dedupeKey)) continue; // ON CONFLICT DO NOTHING
        const id = `n${rows.length + 1}`;
        rows.push({ ...r, id });
        created.push({ id, channel: r.channel });
      }
      return created;
    },
    markSent: async (id, at) => {
      Object.assign(rows.find((r) => r.id === id)!, { status: "SENT", sentAt: at });
    },
    markFailed: async (id, error) => {
      Object.assign(rows.find((r) => r.id === id)!, { status: "FAILED", error });
    },
  };
  return { store, rows, pushSubs };
}

const resolved: ResolvedNotification = {
  userId: "u1",
  userActive: true,
  email: "ana@prepago.test",
  name: "Ana Benítez",
  orderId: "o1",
  eventKey: "ORDER_CONFIRMED:o1",
  content: buildContent({
    type: "ORDER_CONFIRMED",
    order: {
      code: "K7P-4QX",
      restaurantName: "Fit Bowl",
      serviceDate: "2026-11-03",
      slotStartMinute: 720,
      slotEndMinute: 750,
      fulfillment: "PICKUP",
      total: 45000,
    },
  }),
};

const sub = (n: number): PushTarget => ({ endpoint: `https://push.example/${n}`, p256dh: "k", auth: "a" });
const okEmail = (): EmailProvider & { sent: unknown[] } => {
  const sent: unknown[] = [];
  return { name: "test", sent, send: async (m) => void sent.push(m) };
};
const pushWith = (fn: (t: PushTarget) => PushResult): PushSender & { calls: number } => {
  const sender = {
    calls: 0,
    send: async (t: PushTarget) => {
      sender.calls++;
      return fn(t);
    },
  };
  return sender;
};
const event = { type: "ORDER_CONFIRMED", orderId: "o1" } as const;
const quiet = () => undefined;

describe("createNotifier", () => {
  it("crea una fila por canal con dedupeKey y envía", async () => {
    const { store, rows } = memoryStore([sub(1)]);
    const email = okEmail();
    const push = pushWith(() => ({ ok: true }));
    const deliver = createNotifier({ resolve: async () => resolved, store, email, push, baseUrl: "https://app.test" });

    const report = await deliver(event);
    expect(report.created.sort()).toEqual(["EMAIL", "IN_APP", "PUSH"]);
    expect(report.failed).toEqual([]);
    expect(rows.map((r) => r.dedupeKey).sort()).toEqual([
      "ORDER_CONFIRMED:o1:EMAIL",
      "ORDER_CONFIRMED:o1:IN_APP",
      "ORDER_CONFIRMED:o1:PUSH",
    ]);
    expect(rows.every((r) => r.status === "SENT")).toBe(true);
    expect(rows[0].data.url).toBe("/cuenta/pedidos/K7P-4QX");
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]).toMatchObject({
      to: "ana@prepago.test",
      subject: "Pedido K7P-4QX confirmado",
      idempotencyKey: "ORDER_CONFIRMED:o1:EMAIL",
    });
    expect((email.sent[0] as { text: string }).text).toContain("https://app.test/cuenta/pedidos/K7P-4QX");
    expect(push.calls).toBe(1);
  });

  it("es idempotente: la segunda llamada no crea ni envía nada", async () => {
    const { store, rows } = memoryStore([sub(1)]);
    const email = okEmail();
    const push = pushWith(() => ({ ok: true }));
    const deliver = createNotifier({ resolve: async () => resolved, store, email, push, baseUrl: "" });
    await deliver(event);
    const second = await deliver(event);
    expect(second.created).toEqual([]);
    expect(rows).toHaveLength(3);
    expect(email.sent).toHaveLength(1);
    expect(push.calls).toBe(1);
  });

  it("sin proveedores solo crea la bandeja in-app", async () => {
    const { store, rows } = memoryStore([sub(1)]);
    const deliver = createNotifier({ resolve: async () => resolved, store, email: null, push: null, baseUrl: "" });
    const report = await deliver(event);
    expect(report.created).toEqual(["IN_APP"]);
    expect(rows[0]).toMatchObject({ channel: "IN_APP", status: "SENT" });
  });

  it("si el email falla: no lanza, marca FAILED con el error y el resto sigue", async () => {
    const { store, rows } = memoryStore([sub(1)]);
    const email: EmailProvider = {
      name: "roto",
      send: async () => {
        throw new Error("SMTP caído");
      },
    };
    const logError = vi.fn();
    const deliver = createNotifier({
      resolve: async () => resolved,
      store,
      email,
      push: pushWith(() => ({ ok: true })),
      baseUrl: "",
      logError,
    });
    const report = await deliver(event);
    expect(report.failed).toEqual(["EMAIL"]);
    expect(report.sent.sort()).toEqual(["IN_APP", "PUSH"]);
    expect(rows.find((r) => r.channel === "EMAIL")).toMatchObject({ status: "FAILED", error: "SMTP caído" });
    expect(logError).toHaveBeenCalled();
  });

  it("push: borra suscripciones 404/410 y falla si ningún dispositivo lo recibió", async () => {
    const { store, rows, pushSubs } = memoryStore([sub(1), sub(2)]);
    const push = pushWith((t) =>
      t.endpoint.endsWith("/1") ? { ok: false, gone: true, error: "HTTP 410" } : { ok: false, gone: false, error: "HTTP 500" },
    );
    const deliver = createNotifier({ resolve: async () => resolved, store, email: null, push, baseUrl: "", logError: quiet });
    const report = await deliver(event);
    expect(report.failed).toEqual(["PUSH"]);
    expect(pushSubs.map((s) => s.endpoint)).toEqual(["https://push.example/2"]);
    expect(rows.find((r) => r.channel === "PUSH")?.error).toContain("HTTP 410");
  });

  it("push: alcanza con que llegue a un dispositivo", async () => {
    const { store, rows } = memoryStore([sub(1), sub(2)]);
    const push = pushWith((t) => (t.endpoint.endsWith("/1") ? { ok: false, gone: true, error: "HTTP 404" } : { ok: true }));
    const deliver = createNotifier({ resolve: async () => resolved, store, email: null, push, baseUrl: "" });
    await deliver(event);
    expect(rows.find((r) => r.channel === "PUSH")?.status).toBe("SENT");
  });

  it("nunca lanza aunque fallen el resolver o la base", async () => {
    const { store } = memoryStore();
    const failingResolve = createNotifier({
      resolve: async () => {
        throw new Error("base caída");
      },
      store,
      email: okEmail(),
      push: null,
      baseUrl: "",
      logError: quiet,
    });
    await expect(failingResolve(event)).resolves.toMatchObject({ error: "base caída", created: [] });

    const brokenStore: NotificationStore = {
      ...store,
      insertNew: async () => {
        throw new Error("insert falló");
      },
    };
    const failingStore = createNotifier({ resolve: async () => resolved, store: brokenStore, email: null, push: null, baseUrl: "", logError: quiet });
    await expect(failingStore(event)).resolves.toMatchObject({ error: "insert falló" });

    const brokenMark: NotificationStore = {
      ...store,
      markFailed: async () => {
        throw new Error("update falló");
      },
    };
    const email: EmailProvider = { name: "x", send: async () => Promise.reject(new Error("no")) };
    const failingMark = createNotifier({ resolve: async () => resolved, store: brokenMark, email, push: null, baseUrl: "", logError: quiet });
    await expect(failingMark(event)).resolves.toMatchObject({ failed: ["EMAIL"] });
  });

  it("evento que no aplica (resolver devuelve null): no hace nada", async () => {
    const { store, rows } = memoryStore();
    const deliver = createNotifier({ resolve: async () => null, store, email: okEmail(), push: null, baseUrl: "" });
    expect(await deliver(event)).toMatchObject({ eventKey: null, created: [] });
    expect(rows).toHaveLength(0);
  });
});
