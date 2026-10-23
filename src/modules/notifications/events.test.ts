import { afterEach, describe, expect, it, vi } from "vitest";

const deliverNotification = vi.fn();
vi.mock("./service", () => ({ deliverNotification }));

import { notify } from "./events";

afterEach(() => deliverNotification.mockReset());

describe("notify", () => {
  it("fuera de una request envía en línea (scripts, cron) y espera", async () => {
    deliverNotification.mockResolvedValue({ created: ["IN_APP"] });
    await notify({ type: "ORDER_READY", orderId: "o1" });
    expect(deliverNotification).toHaveBeenCalledWith({ type: "ORDER_READY", orderId: "o1" });
  });

  it("nunca lanza aunque el envío falle", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    deliverNotification.mockRejectedValue(new Error("proveedor caído"));
    await expect(notify({ type: "ORDER_CONFIRMED", orderId: "o1" })).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
