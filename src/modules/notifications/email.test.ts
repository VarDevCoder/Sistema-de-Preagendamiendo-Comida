import { describe, expect, it, vi } from "vitest";
import { buildContent } from "./content";
import { ConsoleEmailProvider, ResendEmailProvider } from "./email/providers";
import { renderEmail } from "./email/template";

const content = buildContent({
  type: "ORDER_CANCELLED",
  order: {
    code: "K7P-4QX",
    restaurantName: "Bar <script>",
    serviceDate: "2026-11-03",
    slotStartMinute: 720,
    slotEndMinute: 750,
    fulfillment: "PICKUP",
    total: 45000,
  },
  byRestaurant: true,
  reason: "Sin stock",
  refundAmount: 45000,
});

describe("renderEmail", () => {
  it("HTML escapado, saludo con el nombre y link absoluto", () => {
    const e = renderEmail(content, { baseUrl: "https://app.test", recipientName: "Ana Benítez" });
    expect(e.subject).toBe("Pedido K7P-4QX cancelado");
    expect(e.html).toContain("Bar &lt;script&gt;");
    expect(e.html).not.toContain("<script>");
    expect(e.html).toContain('href="https://app.test/cuenta/pedidos/K7P-4QX"');
    expect(e.text).toContain("Hola Ana,");
    expect(e.text).toContain("Te devolvimos Gs. 45.000 a tu billetera.");
  });
});

describe("proveedores de email", () => {
  it("consola: imprime destinatario, asunto y texto", async () => {
    const lines: string[] = [];
    await new ConsoleEmailProvider((l) => lines.push(l)).send({ to: "a@b.c", subject: "Hola", html: "", text: "Cuerpo" });
    expect(lines[0]).toContain("Para: a@b.c");
    expect(lines[0]).toContain("Asunto: Hola");
  });

  it("Resend: POST a la API con idempotencia; error si responde mal", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const provider = new ResendEmailProvider("re_key", "Prepago <hola@prepago.test>", fetchMock as typeof fetch);
    await provider.send({ to: "a@b.c", subject: "S", html: "<p>h</p>", text: "t", idempotencyKey: "K:EMAIL" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({ Authorization: "Bearer re_key", "Idempotency-Key": "K:EMAIL" });
    expect(JSON.parse(init.body)).toMatchObject({ from: "Prepago <hola@prepago.test>", to: ["a@b.c"], subject: "S" });

    fetchMock.mockResolvedValueOnce(new Response("invalid from", { status: 422 }));
    await expect(provider.send({ to: "a@b.c", subject: "S", html: "", text: "" })).rejects.toThrow("422");
  });
});
