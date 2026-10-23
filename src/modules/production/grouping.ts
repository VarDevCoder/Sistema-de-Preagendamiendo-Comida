import type { Allergen, Fulfillment, OrderKind } from "@/generated/prisma/enums";

// Lista de producción: agrupa los ítems de los pedidos pagos de un día por
// (plato, combinación de modificadores) para que la cocina produzca en tandas.
// Función pura: recibe snapshots de OrderItem (no depende del menú vivo).

export type ProductionItemInput = {
  dishId: string;
  dishName: string;
  quantity: number;
  modifierKey: string;
  modifierSummary: string;
  notes: string | null;
};

export type ProductionOrderInput = {
  id: string;
  code: string;
  customerName: string;
  slotStartMinute: number;
  slotEndMinute: number;
  fulfillment: Fulfillment;
  kind: OrderKind;
  allergens: Allergen[];
  allergyOther: string | null;
  items: ProductionItemInput[];
};

export type SlotKey = { startMinute: number; endMinute: number };

export type SlotQuantity = SlotKey & { quantity: number };

export type ProductionOrderLine = {
  orderId: string;
  code: string;
  customerName: string;
  quantity: number;
  notes: string | null;
  slotStartMinute: number;
  slotEndMinute: number;
  fulfillment: Fulfillment;
  kind: OrderKind;
  allergens: Allergen[];
  allergyOther: string | null;
};

export type ProductionCombo = {
  modifierKey: string;
  summary: string;
  total: number;
  bySlot: SlotQuantity[];
  orders: ProductionOrderLine[];
  hasAllergy: boolean;
  hasNotes: boolean;
};

export type ProductionDish = {
  dishId: string;
  dishName: string;
  total: number;
  bySlot: SlotQuantity[];
  combos: ProductionCombo[];
};

export type ProductionSlot = SlotKey & {
  orders: number;
  units: number;
  dishes: { dishId: string; dishName: string; quantity: number }[];
};

export type ProductionAlert = {
  orderId: string;
  code: string;
  customerName: string;
  slotStartMinute: number;
  allergens: Allergen[];
  allergyOther: string | null;
  /** notas de los ítems del pedido, con el plato al que pertenecen */
  notes: { dishName: string; text: string }[];
};

export type ProductionList = {
  dishes: ProductionDish[];
  slots: ProductionSlot[];
  alerts: ProductionAlert[];
  totals: { orders: number; units: number; dishes: number; ordersWithAllergies: number; ordersWithNotes: number };
};

/** Normaliza la clave por si llegara desordenada: misma selección → mismo grupo. */
export function normalizeModifierKey(key: string): string {
  if (!key) return "";
  return [...new Set(key.split(",").map((s) => s.trim()).filter(Boolean))].sort().join(",");
}

export function hasAllergyInfo(o: Pick<ProductionOrderInput, "allergens" | "allergyOther">): boolean {
  return o.allergens.length > 0 || Boolean(o.allergyOther?.trim());
}

const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const cmpSlot = (a: SlotKey, b: SlotKey) => a.startMinute - b.startMinute || a.endMinute - b.endMinute;
const slotId = (s: SlotKey) => `${s.startMinute}-${s.endMinute}`;

/**
 * El texto visible de un grupo sale del snapshot. Si el restaurante renombró
 * una opción entre pedidos, puede haber textos distintos para la misma clave:
 * se usa el más frecuente (empate → orden alfabético) para que sea estable.
 */
function dominant(counts: Map<string, number>): string {
  return [...counts].sort((a, b) => b[1] - a[1] || cmpStr(a[0], b[0]))[0]?.[0] ?? "";
}

function addTo<K>(map: Map<K, number>, key: K, n: number) {
  map.set(key, (map.get(key) ?? 0) + n);
}

function slotList(map: Map<string, { slot: SlotKey; quantity: number }>): SlotQuantity[] {
  return [...map.values()].map((v) => ({ ...v.slot, quantity: v.quantity })).sort(cmpSlot);
}

export function buildProductionList(orders: ProductionOrderInput[]): ProductionList {
  type ComboAcc = {
    modifierKey: string;
    summaries: Map<string, number>;
    total: number;
    bySlot: Map<string, { slot: SlotKey; quantity: number }>;
    lines: ProductionOrderLine[];
  };
  type DishAcc = {
    dishId: string;
    names: Map<string, number>;
    total: number;
    bySlot: Map<string, { slot: SlotKey; quantity: number }>;
    combos: Map<string, ComboAcc>;
  };

  const dishes = new Map<string, DishAcc>();
  const slots = new Map<string, { slot: SlotKey; orderIds: Set<string>; units: number; dishes: Map<string, number> }>();
  const alerts: ProductionAlert[] = [];
  let units = 0;
  let ordersWithNotes = 0;

  for (const o of orders) {
    const slot: SlotKey = { startMinute: o.slotStartMinute, endMinute: o.slotEndMinute };
    const sid = slotId(slot);
    const slotAcc = slots.get(sid) ?? { slot, orderIds: new Set(), units: 0, dishes: new Map() };
    slots.set(sid, slotAcc);
    slotAcc.orderIds.add(o.id);

    const orderNotes: ProductionAlert["notes"] = [];

    // Un pedido puede tener dos líneas iguales (mismo plato y combinación):
    // en la lista del grupo se muestran sumadas en una sola fila por pedido.
    for (const item of o.items) {
      if (item.quantity <= 0) continue;
      const key = normalizeModifierKey(item.modifierKey);
      const note = item.notes?.trim() || null;
      if (note) orderNotes.push({ dishName: item.dishName, text: note });

      const dish: DishAcc = dishes.get(item.dishId) ?? {
        dishId: item.dishId,
        names: new Map(),
        total: 0,
        bySlot: new Map(),
        combos: new Map(),
      };
      dishes.set(item.dishId, dish);
      addTo(dish.names, item.dishName, item.quantity);
      dish.total += item.quantity;
      const ds = dish.bySlot.get(sid) ?? { slot, quantity: 0 };
      ds.quantity += item.quantity;
      dish.bySlot.set(sid, ds);

      const combo: ComboAcc = dish.combos.get(key) ?? { modifierKey: key, summaries: new Map(), total: 0, bySlot: new Map(), lines: [] };
      dish.combos.set(key, combo);
      addTo(combo.summaries, item.modifierSummary.trim(), item.quantity);
      combo.total += item.quantity;
      const cs = combo.bySlot.get(sid) ?? { slot, quantity: 0 };
      cs.quantity += item.quantity;
      combo.bySlot.set(sid, cs);

      const existing = combo.lines.find((l) => l.orderId === o.id);
      if (existing) {
        existing.quantity += item.quantity;
        if (note) existing.notes = existing.notes ? `${existing.notes} / ${note}` : note;
      } else {
        combo.lines.push({
          orderId: o.id,
          code: o.code,
          customerName: o.customerName,
          quantity: item.quantity,
          notes: note,
          slotStartMinute: o.slotStartMinute,
          slotEndMinute: o.slotEndMinute,
          fulfillment: o.fulfillment,
          kind: o.kind,
          allergens: o.allergens,
          allergyOther: o.allergyOther,
        });
      }

      slotAcc.units += item.quantity;
      addTo(slotAcc.dishes, item.dishId, item.quantity);
      units += item.quantity;
    }

    if (orderNotes.length) ordersWithNotes += 1;
    if (hasAllergyInfo(o) || orderNotes.length) {
      alerts.push({
        orderId: o.id,
        code: o.code,
        customerName: o.customerName,
        slotStartMinute: o.slotStartMinute,
        allergens: o.allergens,
        allergyOther: o.allergyOther,
        notes: orderNotes,
      });
    }
  }

  const dishList: ProductionDish[] = [...dishes.values()].map((d) => {
    const combos: ProductionCombo[] = [...d.combos.values()].map((c) => {
      const lines = [...c.lines].sort(
        (a, b) => a.slotStartMinute - b.slotStartMinute || cmpStr(a.code, b.code),
      );
      return {
        modifierKey: c.modifierKey,
        summary: dominant(c.summaries),
        total: c.total,
        bySlot: slotList(c.bySlot),
        orders: lines,
        hasAllergy: lines.some(hasAllergyInfo),
        hasNotes: lines.some((l) => Boolean(l.notes)),
      };
    });
    // Orden estable: más unidades primero; empate → texto y clave.
    combos.sort((a, b) => b.total - a.total || cmpStr(a.summary, b.summary) || cmpStr(a.modifierKey, b.modifierKey));
    return { dishId: d.dishId, dishName: dominant(d.names), total: d.total, bySlot: slotList(d.bySlot), combos };
  });
  dishList.sort((a, b) => b.total - a.total || cmpStr(a.dishName, b.dishName) || cmpStr(a.dishId, b.dishId));

  const dishNames = new Map(dishList.map((d) => [d.dishId, d.dishName]));
  const dishOrder = new Map(dishList.map((d, i) => [d.dishId, i]));
  const slotListOut: ProductionSlot[] = [...slots.values()]
    .map((s) => ({
      ...s.slot,
      orders: s.orderIds.size,
      units: s.units,
      dishes: [...s.dishes]
        .map(([dishId, quantity]) => ({ dishId, dishName: dishNames.get(dishId) ?? "", quantity }))
        .sort((a, b) => (dishOrder.get(a.dishId) ?? 0) - (dishOrder.get(b.dishId) ?? 0)),
    }))
    .sort(cmpSlot);

  alerts.sort((a, b) => a.slotStartMinute - b.slotStartMinute || cmpStr(a.code, b.code));

  return {
    dishes: dishList,
    slots: slotListOut,
    alerts,
    totals: {
      orders: orders.length,
      units,
      dishes: dishList.length,
      ordersWithAllergies: orders.filter(hasAllergyInfo).length,
      ordersWithNotes,
    },
  };
}

/** Estado de la lista según la hora de corte: antes es provisoria (pueden entrar pedidos). */
export function productionListState(cutoffAt: Date, now: Date): "PROVISIONAL" | "CLOSED" {
  return now.getTime() < cutoffAt.getTime() ? "PROVISIONAL" : "CLOSED";
}
