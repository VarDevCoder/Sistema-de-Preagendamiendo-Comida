import { describe, expect, it } from "vitest";
import { reminderServiceDate } from "./reminders";

// Asunción es UTC−3 todo el año.
describe("reminderServiceDate (mañana en America/Asuncion)", () => {
  it("a la hora del cron (21:00 UTC = 18:00 local) es el día siguiente", () => {
    expect(reminderServiceDate(new Date("2026-10-22T21:00:00Z"))).toBe("2026-10-23");
  });
  it("de noche en Asunción ya es otro día en UTC: manda la fecha local", () => {
    // 23:30 del 22 en Asunción = 02:30 UTC del 23
    expect(reminderServiceDate(new Date("2026-10-23T02:30:00Z"))).toBe("2026-10-23");
  });
  it("pasada la medianoche local cambia el día", () => {
    // 00:30 del 23 en Asunción = 03:30 UTC
    expect(reminderServiceDate(new Date("2026-10-23T03:30:00Z"))).toBe("2026-10-24");
  });
  it("cruza fin de mes y de año", () => {
    expect(reminderServiceDate(new Date("2026-10-31T21:00:00Z"))).toBe("2026-11-01");
    expect(reminderServiceDate(new Date("2026-12-31T21:00:00Z"))).toBe("2027-01-01");
  });
});
