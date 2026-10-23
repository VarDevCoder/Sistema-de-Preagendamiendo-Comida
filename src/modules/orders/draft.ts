import { modifierKey, modifierSummary, validateSelection, type ModifierGroupDef, type SelectedModifier } from "@/modules/menu/modifiers";
import { itemNutrition, sumNutrition, type DishNutrition, type Nutrition, type NutritionTotals } from "@/modules/menu/nutrition";
import { priceLine, priceOrder, type LinePrice, type OrderPrice } from "./pricing";

// Armado puro de un pedido (precios, macros y snapshots) a partir de las
// definiciones VIGENTES del menú leídas en el servidor. Mismo cálculo que el seed.

export type DraftDish = {
  id: string;
  name: string;
  photoUrl: string | null;
  basePrice: number;
  allowNotes: boolean;
  nutrition: DishNutrition;
  groups: ModifierGroupDef[];
};

export type DraftItemInput = { dishId: string; optionIds: string[]; quantity: number; notes?: string };

export type DraftLine = {
  dish: DraftDish;
  quantity: number;
  notes?: string;
  selected: SelectedModifier[];
  price: LinePrice;
  nutrition: Nutrition | null;
  modifierKey: string;
  modifierSummary: string;
};

export type OrderDraft = { lines: DraftLine[]; price: OrderPrice; nutrition: NutritionTotals };

export type DraftResult = { ok: true; draft: OrderDraft } | { ok: false; error: string; itemIndex?: number };

export function buildOrderDraft(p: {
  dishes: ReadonlyMap<string, DraftDish>;
  items: DraftItemInput[];
  discountBps: number;
  deliveryFee: number;
  commissionBps: number;
}): DraftResult {
  const lines: DraftLine[] = [];
  for (const [i, item] of p.items.entries()) {
    const dish = p.dishes.get(item.dishId);
    if (!dish) return { ok: false, itemIndex: i, error: "Uno de los platos ya no está disponible." };
    if (item.notes && !dish.allowNotes) return { ok: false, itemIndex: i, error: `"${dish.name}" no admite notas.` };
    const sel = validateSelection(dish.groups, item.optionIds);
    if (!sel.ok) return { ok: false, itemIndex: i, error: `${dish.name}: ${sel.errors[0].message}` };
    const price = priceLine({ basePrice: dish.basePrice, priceDeltas: sel.selected.map((s) => s.option.priceDelta), quantity: item.quantity });
    lines.push({
      dish,
      quantity: item.quantity,
      notes: item.notes,
      selected: sel.selected,
      price,
      nutrition: itemNutrition(dish.nutrition, sel.selected.map((s) => s.option)),
      modifierKey: modifierKey(sel.selected.map((s) => s.option.id)),
      modifierSummary: modifierSummary(sel.selected),
    });
  }
  const price = priceOrder({
    lineListTotals: lines.map((l) => l.price.lineListTotal),
    discountBps: p.discountBps,
    deliveryFee: p.deliveryFee,
    commissionBps: p.commissionBps,
  });
  const nutrition = sumNutrition(lines.map((l) => ({ nutrition: l.nutrition, quantity: l.quantity })));
  return { ok: true, draft: { lines, price, nutrition } };
}

/** Datos de OrderItem (+ modificadores) para `order.create({ items: { create } })`. */
export function orderItemsCreateData(draft: OrderDraft) {
  return draft.lines.map((l, i) => ({
    dishId: l.dish.id,
    quantity: l.quantity,
    dishName: l.dish.name,
    dishPhotoUrl: l.dish.photoUrl,
    unitBasePrice: l.price.unitBasePrice,
    unitModifiersTotal: l.price.unitModifiersTotal,
    unitListPrice: l.price.unitListPrice,
    lineListTotal: l.price.lineListTotal,
    lineDiscount: draft.price.lineDiscounts[i],
    lineTotal: draft.price.lineTotals[i],
    modifierKey: l.modifierKey,
    modifierSummary: l.modifierSummary,
    notes: l.notes,
    servingGrams: l.nutrition?.servingGrams ?? null,
    kcal: l.nutrition?.kcal ?? null,
    proteinG: l.nutrition?.proteinG ?? null,
    carbsG: l.nutrition?.carbsG ?? null,
    fatG: l.nutrition?.fatG ?? null,
    fiberG: l.nutrition?.fiberG ?? null,
    sugarG: l.nutrition?.sugarG ?? null,
    sodiumMg: l.nutrition?.sodiumMg ?? null,
    modifiers: {
      create: l.selected.map((s, j) => ({
        optionId: s.option.id,
        groupId: s.group.id,
        groupName: s.group.name,
        optionName: s.option.name,
        priceDelta: s.option.priceDelta,
        sortOrder: j,
        kcalDelta: s.option.kcalDelta,
        proteinDeltaG: s.option.proteinDeltaG,
        carbsDeltaG: s.option.carbsDeltaG,
        fatDeltaG: s.option.fatDeltaG,
        fiberDeltaG: s.option.fiberDeltaG,
        sugarDeltaG: s.option.sugarDeltaG,
        sodiumDeltaMg: s.option.sodiumDeltaMg,
      })),
    },
  }));
}

/** Totales nutricionales del pedido (columnas de Order). */
export function orderNutritionData(n: NutritionTotals) {
  return {
    nutritionComplete: n.complete,
    kcal: n.totals?.kcal ?? null,
    proteinG: n.totals?.proteinG ?? null,
    carbsG: n.totals?.carbsG ?? null,
    fatG: n.totals?.fatG ?? null,
    fiberG: n.totals?.fiberG ?? null,
    sugarG: n.totals?.sugarG ?? null,
    sodiumMg: n.totals?.sodiumMg ?? null,
  };
}
