import { describe, expect, it } from "vitest";
import { dishScheduleSchema, slotTemplateSchema } from "./schemas";
import { capacityError, findSlotOverlap, rangesOverlap, scopesConflict } from "./slot-rules";
import { diffSchedule, shouldPropagateDefault, stockBelowUsedError } from "./stock-rules";

describe("solapes de franjas", () => {
  const t = (id: string, weekday: number, start: number, end: number, scope: "PICKUP" | "DELIVERY" | "BOTH", isActive = true) => ({
    id,
    weekday,
    startMinute: start,
    endMinute: end,
    scope,
    isActive,
  });
  const existing = [t("a", 1, 720, 750, "BOTH"), t("b", 1, 1140, 1170, "DELIVERY"), t("c", 2, 720, 750, "PICKUP", false)];

  it("franjas contiguas no se solapan", () => {
    expect(rangesOverlap({ startMinute: 720, endMinute: 750 }, { startMinute: 750, endMinute: 780 })).toBe(false);
    expect(findSlotOverlap(t("x", 1, 750, 780, "BOTH"), existing)).toBeNull();
  });

  it("detecta solape con una franja BOTH para cualquier modalidad", () => {
    expect(findSlotOverlap(t("x", 1, 735, 765, "PICKUP"), existing)?.id).toBe("a");
  });

  it("retiro y delivery pueden compartir horario", () => {
    expect(scopesConflict("PICKUP", "DELIVERY")).toBe(false);
    expect(findSlotOverlap(t("x", 1, 1140, 1170, "PICKUP"), existing)).toBeNull();
    expect(findSlotOverlap(t("x", 1, 1150, 1180, "DELIVERY"), existing)?.id).toBe("b");
  });

  it("ignora la propia franja, otros días y las inactivas", () => {
    expect(findSlotOverlap(t("a", 1, 720, 760, "BOTH"), existing)).toBeNull();
    expect(findSlotOverlap(t("x", 3, 720, 750, "BOTH"), existing)).toBeNull();
    expect(findSlotOverlap(t("x", 2, 720, 750, "PICKUP"), existing)).toBeNull();
  });

  it("no se puede bajar el cupo por debajo de lo ocupado", () => {
    expect(capacityError(10, 8)).toBeNull();
    expect(capacityError(8, 8)).toBeNull();
    expect(capacityError(5, 8)).toMatch(/8 pedido/);
  });

  it("slotTemplateSchema valida horario y días", () => {
    const base = { weekdays: [1, 2], startMinute: "12:00", endMinute: "12:30", capacity: "15", scope: "BOTH", isActive: "on" };
    expect(slotTemplateSchema.parse(base)).toMatchObject({ startMinute: 720, endMinute: 750, capacity: 15, isActive: true });
    expect(slotTemplateSchema.safeParse({ ...base, endMinute: "11:00" }).success).toBe(false);
    expect(slotTemplateSchema.safeParse({ ...base, endMinute: "12:05" }).success).toBe(false);
    expect(slotTemplateSchema.safeParse({ ...base, weekdays: [] }).success).toBe(false);
    expect(slotTemplateSchema.safeParse({ ...base, capacity: "0" }).success).toBe(false);
    expect(slotTemplateSchema.safeParse({ ...base, scope: "OTRO" }).success).toBe(false);
  });
});

describe("actualización de stock en días futuros", () => {
  const row = { date: "2026-11-05", today: "2026-11-01", currentValue: 30, previousDefault: 30, holdingQty: 0 };

  it("actualiza filas futuras sin pedidos que tienen el valor anterior", () => {
    expect(shouldPropagateDefault(row)).toBe(true);
  });

  it("no toca hoy ni días pasados", () => {
    expect(shouldPropagateDefault({ ...row, date: "2026-11-01" })).toBe(false);
    expect(shouldPropagateDefault({ ...row, date: "2026-10-30" })).toBe(false);
  });

  it("no toca días con pedidos que retienen stock", () => {
    expect(shouldPropagateDefault({ ...row, holdingQty: 1 })).toBe(false);
  });

  it("respeta lo que el restaurante editó a mano", () => {
    expect(shouldPropagateDefault({ ...row, currentValue: 25 })).toBe(false);
  });

  it("no se puede bajar el stock por debajo de lo vendido/reservado", () => {
    expect(stockBelowUsedError(10, 10)).toBeNull();
    expect(stockBelowUsedError(9, 10)).toMatch(/10 vendido/);
  });

  it("diffSchedule detecta días agregados, quitados y cambiados", () => {
    const d = diffSchedule(
      [
        { weekday: 1, defaultStock: 30 },
        { weekday: 2, defaultStock: 30 },
        { weekday: 3, defaultStock: 20 },
      ],
      [
        { weekday: 1, defaultStock: 30 },
        { weekday: 3, defaultStock: 25 },
        { weekday: 5, defaultStock: 10 },
      ],
    );
    expect(d).toEqual({
      added: [{ weekday: 5, defaultStock: 10 }],
      removed: [{ weekday: 2, defaultStock: 30 }],
      changed: [{ weekday: 3, from: 20, to: 25 }],
    });
  });

  it("dishScheduleSchema: vacío = no se ofrece ese día", () => {
    expect(dishScheduleSchema.parse({ stocks: ["30", "", "20", "", "", "", "0"] }).stocks).toEqual([30, null, 20, null, null, null, 0]);
    expect(dishScheduleSchema.safeParse({ stocks: ["30"] }).success).toBe(false);
    expect(dishScheduleSchema.safeParse({ stocks: ["-1", "", "", "", "", "", ""] }).success).toBe(false);
  });
});
