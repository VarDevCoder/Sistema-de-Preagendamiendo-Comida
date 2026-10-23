import { describe, expect, it } from "vitest";
import { formatInboxDate, formatServiceDate, formatShortDate } from "./format";

describe("formatos de fecha", () => {
  it("día de servicio en texto", () => {
    expect(formatServiceDate("2026-11-03")).toBe("martes 3 de noviembre");
    expect(formatServiceDate("2026-11-08")).toBe("domingo 8 de noviembre");
    expect(formatShortDate("2026-01-09")).toBe("9/1");
  });
  it("bandeja: hoy / ayer / fecha, en hora de Asunción", () => {
    const now = new Date("2026-10-22T21:00:00Z"); // 18:00 del 22 en Asunción
    expect(formatInboxDate(new Date("2026-10-22T12:05:00Z"), now)).toBe("hoy 09:05");
    expect(formatInboxDate(new Date("2026-10-22T02:00:00Z"), now)).toBe("ayer 23:00");
    expect(formatInboxDate(new Date("2026-10-19T15:00:00Z"), now)).toBe("19/10 12:00");
  });
});
