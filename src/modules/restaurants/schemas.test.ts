import { describe, expect, it } from "vitest";
import { cutoffInstant } from "@/modules/shared/time";
import { describeCutoff, describeWeekdays, maxGuaranteedPlanDays, validateTiers } from "./rules";
import { fulfillmentSchema, openingHoursSchema, orderingSchema, planSchema, profileSchema, tiersSchema } from "./schemas";

describe("hora de corte", () => {
  it("se describe en lenguaje simple", () => {
    expect(describeCutoff(1, 1200)).toBe("El día anterior a las 20:00");
    expect(describeCutoff(0, 600)).toBe("El mismo día a las 10:00");
    expect(describeCutoff(2, 1110)).toBe("2 días antes a las 18:30");
  });

  it("orderingSchema guarda minutos y bps", () => {
    const r = orderingSchema.parse({ cutoffDaysBefore: "1", cutoffMinute: "20:00", maxDaysAhead: "30", customerCancelRefundBps: "80" });
    expect(r).toEqual({ cutoffDaysBefore: 1, cutoffMinute: 1200, maxDaysAhead: 30, customerCancelRefundBps: 8000 });
    // coincide con el instante de corte del dominio: pedido del martes cierra el lunes 20:00 (UTC-3)
    expect(cutoffInstant("2026-11-03", r.cutoffDaysBefore, r.cutoffMinute).toISOString()).toBe("2026-11-02T23:00:00.000Z");
  });

  it("rechaza horas inválidas, 24:00 y días fuera de rango", () => {
    const base = { cutoffDaysBefore: "1", cutoffMinute: "20:00", maxDaysAhead: "30", customerCancelRefundBps: "100" };
    expect(orderingSchema.safeParse({ ...base, cutoffMinute: "24:00" }).success).toBe(false);
    expect(orderingSchema.safeParse({ ...base, cutoffMinute: "" }).success).toBe(false);
    expect(orderingSchema.safeParse({ ...base, cutoffDaysBefore: "8" }).success).toBe(false);
    expect(orderingSchema.safeParse({ ...base, customerCancelRefundBps: "120" }).success).toBe(false);
    expect(orderingSchema.safeParse({ ...base, maxDaysAhead: "0" }).success).toBe(false);
  });

  it("maxDaysAhead no puede ser menor que los días del corte", () => {
    const r = orderingSchema.safeParse({ cutoffDaysBefore: "3", cutoffMinute: "20:00", maxDaysAhead: "2", customerCancelRefundBps: "100" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(["maxDaysAhead"]);
  });
});

describe("escalones de anticipación", () => {
  it("acepta escalones crecientes", () => {
    expect(validateTiers([{ minHoursBefore: 72, discountBps: 1500 }, { minHoursBefore: 24, discountBps: 1000 }])).toBeNull();
    expect(validateTiers([])).toBeNull();
  });

  it("rechaza horas repetidas y descuentos que bajan con más anticipación", () => {
    expect(validateTiers([{ minHoursBefore: 24, discountBps: 1000 }, { minHoursBefore: 24, discountBps: 1200 }])).toMatch(/dos escalones/);
    expect(validateTiers([{ minHoursBefore: 24, discountBps: 1500 }, { minHoursBefore: 72, discountBps: 1000 }])).toMatch(/menos descuento/);
  });

  it("tiersSchema convierte % a bps y limita a 90%", () => {
    expect(tiersSchema.parse({ tiers: [{ minHoursBefore: "24", discountBps: "10" }] }).tiers).toEqual([
      { minHoursBefore: 24, discountBps: 1000 },
    ]);
    expect(tiersSchema.safeParse({ tiers: [{ minHoursBefore: "24", discountBps: "95" }] }).success).toBe(false);
  });
});

describe("plan mensual", () => {
  const base = {
    enabled: "on",
    discountBps: "20",
    weekdays: [1, 2, 3, 4, 5],
    periodMode: "NEXT_MONTH",
    signupDeadlineDay: "25",
    minDays: "5",
    cancelDaysBefore: "1",
    cancelMinute: "18:00",
    cancelRefundBps: "100",
    allowPause: "on",
  };

  it("parsea una configuración válida", () => {
    const r = planSchema.parse(base);
    expect(r).toMatchObject({ enabled: true, discountBps: 2000, cancelMinute: 1080, cancelRefundBps: 10000, allowPause: true });
  });

  it("exige días si está habilitado y un mínimo alcanzable", () => {
    expect(planSchema.safeParse({ ...base, weekdays: [] }).success).toBe(false);
    expect(planSchema.safeParse({ ...base, enabled: "", weekdays: [] }).success).toBe(true);
    expect(maxGuaranteedPlanDays([1, 3])).toBe(8);
    expect(planSchema.safeParse({ ...base, weekdays: [1, 3], minDays: "9" }).success).toBe(false);
    expect(planSchema.safeParse({ ...base, signupDeadlineDay: "30" }).success).toBe(false);
  });
});

describe("datos, modalidades y horarios", () => {
  it("perfil: opcionales vacíos → null y email normalizado", () => {
    const r = profileSchema.parse({ name: "Doña Rosa", description: "", addressLine: "Estrella 845", zoneId: "z1", phone: "", email: " Rosa@Mail.com " });
    expect(r).toMatchObject({ description: null, phone: null, email: "rosa@mail.com" });
    expect(profileSchema.safeParse({ name: "", addressLine: "x", zoneId: "z1" }).success).toBe(false);
  });

  it("modalidades: al menos una, y delivery necesita zonas", () => {
    expect(fulfillmentSchema.safeParse({ pickupEnabled: "", deliveryEnabled: "", zones: [] }).success).toBe(false);
    expect(fulfillmentSchema.safeParse({ pickupEnabled: "", deliveryEnabled: "on", zones: [] }).success).toBe(false);
    const ok = fulfillmentSchema.parse({ pickupEnabled: "", deliveryEnabled: "on", zones: [{ zoneId: "z", fee: "10.000" }] });
    expect(ok.zones[0].fee).toBe(10000);
  });

  it("horarios: apertura antes del cierre en los días abiertos", () => {
    const days = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday: String(weekday), open: weekday <= 5 ? "on" : "", opensMinute: 660, closesMinute: 870 }));
    expect(openingHoursSchema.safeParse({ days }).success).toBe(true);
    days[0] = { ...days[0], opensMinute: 900 };
    expect(openingHoursSchema.safeParse({ days }).success).toBe(false);
    days[0] = { ...days[0], open: "" };
    expect(openingHoursSchema.safeParse({ days }).success).toBe(true);
  });

  it("describeWeekdays", () => {
    expect(describeWeekdays([1, 2, 3, 4, 5])).toBe("Lun a Vie");
    expect(describeWeekdays([5, 1, 3])).toBe("Lun, Mié y Vie");
    expect(describeWeekdays([1, 2, 3, 4, 5, 6, 7])).toBe("Todos los días");
    expect(describeWeekdays([6])).toBe("Sáb");
  });
});
