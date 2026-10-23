import { Prisma } from "@/generated/prisma/client";
import type { Fulfillment, SlotScope } from "@/generated/prisma/enums";
import type { Tx } from "@/lib/db-types";
import { slotServes } from "@/modules/availability/dates";
import { formatMinute, zonedInstant, type DateKey } from "@/modules/shared/time";
import { HOLDING_CONDITION_SQL } from "./statuses";

// Reserva de cupo y stock (RN-1). SIEMPRE dentro de una transacción y después
// de ensureDayMaterialized. Bloquea en orden fijo para evitar deadlocks:
//   DailySlot → DailyDishStock (por id) → OptionDailyStock (por id)
// y cuenta lo ocupado desde los pedidos que retienen (HOLDING_CONDITION_SQL),
// así una reserva vencida deja de contar sola.

export class ReservationError extends Error {
  constructor(
    message: string,
    readonly code: "SLOT_NOT_FOUND" | "SLOT_CLOSED" | "SLOT_SCOPE" | "SLOT_STARTED" | "SLOT_FULL" | "DISH_UNAVAILABLE" | "DISH_STOCK" | "OPTION_STOCK",
  ) {
    super(message);
    this.name = "ReservationError";
  }
}

export type ReservationItem = { dishId: string; dishName: string; quantity: number; optionIds: string[] };

export type ReservationRequest = {
  restaurantId: string;
  date: DateKey;
  slotId: string;
  fulfillment: Fulfillment;
  items: ReservationItem[];
  /** opciones con stock diario (ModifierOption.dailyStock != null) → nombre, para validar aunque falte la fila */
  limitedOptions: Map<string, string>;
  /** al confirmar un pedido existente, no contarse a sí mismo */
  excludeOrderId?: string;
  now: Date;
};

export type LockedSlot = { id: string; startMinute: number; endMinute: number; capacity: number; scope: SlotScope; isClosed: boolean };

const HOLDING = Prisma.raw(HOLDING_CONDITION_SQL);

export async function reserveCapacity(tx: Tx, req: ReservationRequest): Promise<LockedSlot> {
  const exclude = req.excludeOrderId ?? "";

  // 1) Franja
  const [slot] = await tx.$queryRaw<LockedSlot[]>`
    SELECT "id", "startMinute", "endMinute", "capacity", "scope", "isClosed"
    FROM "DailySlot"
    WHERE "id" = ${req.slotId} AND "restaurantId" = ${req.restaurantId} AND "date" = ${req.date}::date
    FOR UPDATE`;
  if (!slot) throw new ReservationError("Esa franja no existe para el día elegido.", "SLOT_NOT_FOUND");
  const label = formatMinute(slot.startMinute);
  if (slot.isClosed) throw new ReservationError(`La franja de las ${label} ya no está disponible.`, "SLOT_CLOSED");
  if (!slotServes(slot.scope, req.fulfillment)) {
    throw new ReservationError(
      `La franja de las ${label} es solo para ${slot.scope === "PICKUP" ? "retiro" : "delivery"}.`,
      "SLOT_SCOPE",
    );
  }
  if (zonedInstant(req.date, slot.startMinute).getTime() <= req.now.getTime()) {
    throw new ReservationError(`La franja de las ${label} ya empezó.`, "SLOT_STARTED");
  }
  const [{ held }] = await tx.$queryRaw<{ held: bigint }[]>`
    SELECT count(*) AS held FROM "Order"
    WHERE "slotId" = ${slot.id} AND "id" <> ${exclude} AND ${HOLDING}`;
  if (Number(held) + 1 > slot.capacity) {
    throw new ReservationError(`Se llenó la franja de las ${label}. Elegí otra.`, "SLOT_FULL");
  }

  // 2) Platos (stock por fecha)
  const needDish = new Map<string, { qty: number; name: string }>();
  for (const it of req.items) {
    const cur = needDish.get(it.dishId) ?? { qty: 0, name: it.dishName };
    cur.qty += it.quantity;
    needDish.set(it.dishId, cur);
  }
  const dishIds = [...needDish.keys()];
  const stocks = await tx.$queryRaw<{ id: string; dishId: string; stock: number; isClosed: boolean }[]>`
    SELECT "id", "dishId", "stock", "isClosed" FROM "DailyDishStock"
    WHERE "dishId" = ANY(${dishIds}::text[]) AND "date" = ${req.date}::date
    ORDER BY "id"
    FOR UPDATE`;
  const soldDish = await tx.$queryRaw<{ dishId: string; sold: bigint }[]>`
    SELECT oi."dishId", coalesce(sum(oi."quantity"), 0) AS sold
    FROM "OrderItem" oi JOIN "Order" o ON o."id" = oi."orderId"
    WHERE o."restaurantId" = ${req.restaurantId} AND o."serviceDate" = ${req.date}::date
      AND oi."dishId" = ANY(${dishIds}::text[]) AND o."id" <> ${exclude} AND ${HOLDING}
    GROUP BY oi."dishId"`;
  const soldByDish = new Map(soldDish.map((r) => [r.dishId, Number(r.sold)]));
  const stockByDish = new Map(stocks.map((s) => [s.dishId, s]));
  for (const [dishId, need] of needDish) {
    const s = stockByDish.get(dishId);
    if (!s || s.isClosed) throw new ReservationError(`"${need.name}" no está disponible ese día.`, "DISH_UNAVAILABLE");
    const remaining = s.stock - (soldByDish.get(dishId) ?? 0);
    if (need.qty > remaining) {
      throw new ReservationError(
        remaining <= 0
          ? `Se agotó "${need.name}" para ese día.`
          : `Quedan solo ${remaining} de "${need.name}" para ese día.`,
        "DISH_STOCK",
      );
    }
  }

  // 3) Opciones con stock diario propio
  const needOption = new Map<string, number>();
  for (const it of req.items) {
    for (const o of it.optionIds) if (req.limitedOptions.has(o)) needOption.set(o, (needOption.get(o) ?? 0) + it.quantity);
  }
  if (needOption.size > 0) {
    const optionIds = [...needOption.keys()];
    const rows = await tx.$queryRaw<{ id: string; optionId: string; stock: number }[]>`
      SELECT "id", "optionId", "stock" FROM "OptionDailyStock"
      WHERE "optionId" = ANY(${optionIds}::text[]) AND "date" = ${req.date}::date
      ORDER BY "id"
      FOR UPDATE`;
    const sold = await tx.$queryRaw<{ optionId: string; sold: bigint }[]>`
      SELECT m."optionId", coalesce(sum(oi."quantity"), 0) AS sold
      FROM "OrderItemModifier" m
      JOIN "OrderItem" oi ON oi."id" = m."orderItemId"
      JOIN "Order" o ON o."id" = oi."orderId"
      WHERE o."restaurantId" = ${req.restaurantId} AND o."serviceDate" = ${req.date}::date
        AND m."optionId" = ANY(${optionIds}::text[]) AND o."id" <> ${exclude} AND ${HOLDING}
      GROUP BY m."optionId"`;
    const soldBy = new Map(sold.map((r) => [r.optionId, Number(r.sold)]));
    const stockBy = new Map(rows.map((r) => [r.optionId, r.stock]));
    for (const [optionId, qty] of needOption) {
      const name = req.limitedOptions.get(optionId)!;
      // Sin fila del día (no debería pasar después de materializar): no se vende a ciegas.
      const stock = stockBy.get(optionId) ?? 0;
      const remaining = stock - (soldBy.get(optionId) ?? 0);
      if (qty > remaining) {
        throw new ReservationError(
          remaining <= 0 ? `Se agotó "${name}" para ese día.` : `Quedan solo ${remaining} de "${name}" para ese día.`,
          "OPTION_STOCK",
        );
      }
    }
  }

  return slot;
}
