import { describe, expect, it } from "vitest";
import {
  addDays,
  cutoffInstant,
  eachDay,
  formatMinute,
  isoWeekday,
  minuteOfDay,
  monthBounds,
  nextMonthStart,
  parseMinute,
  todayKey,
  zonedInstant,
} from "./time";

describe("fechas en America/Asuncion (UTC−3)", () => {
  it("el día de hoy depende de la hora local, no de UTC", () => {
    // 2026-11-04 02:00 UTC = 2026-11-03 23:00 en Asunción
    expect(todayKey(new Date("2026-11-04T02:00:00Z"))).toBe("2026-11-03");
    expect(minuteOfDay(new Date("2026-11-04T02:00:00Z"))).toBe(23 * 60);
  });

  it("convierte día + minuto local a instante", () => {
    expect(zonedInstant("2026-11-03", 12 * 60).toISOString()).toBe("2026-11-03T15:00:00.000Z");
  });

  it("calcula la hora de corte: el día anterior a las 20:00", () => {
    expect(cutoffInstant("2026-11-03", 1, 1200).toISOString()).toBe("2026-11-02T23:00:00.000Z");
  });

  it("aritmética de días y semana ISO", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(isoWeekday("2026-11-02")).toBe(1); // lunes
    expect(isoWeekday("2026-11-08")).toBe(7); // domingo
    expect(eachDay("2026-11-01", "2026-11-03")).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
  });

  it("límites de mes", () => {
    expect(monthBounds("2026-02-10")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(nextMonthStart("2026-12-15")).toBe("2027-01-01");
  });

  it("horas como minutos", () => {
    expect(parseMinute("12:30")).toBe(750);
    expect(formatMinute(750)).toBe("12:30");
    expect(() => parseMinute("25:00")).toThrow();
  });
});
