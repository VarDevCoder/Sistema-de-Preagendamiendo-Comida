import "server-only";
import { db } from "@/lib/db";

export async function getCustomerProfile(userId: string) {
  const [profile, addresses] = await Promise.all([
    db.customerProfile.findUnique({ where: { userId } }),
    db.customerAddress.findMany({
      where: { userId },
      include: { zone: { select: { id: true, name: true } } },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    }),
  ]);
  return { allergens: profile?.allergens ?? [], allergyOther: profile?.allergyOther ?? null, addresses };
}

export async function getZones() {
  return db.zone.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
}

export async function getCustomerPreferences(userId: string) {
  const [tags, prefs] = await Promise.all([
    db.preferenceTag.findMany({ orderBy: { sortOrder: "asc" } }),
    db.customerPreference.findMany({
      where: { userId },
      include: {
        dish: { select: { id: true, name: true, deletedAt: true, restaurant: { select: { name: true, slug: true } } } },
        option: { select: { name: true, group: { select: { name: true } } } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const generalTagIds = new Set(prefs.filter((p) => p.scope === "GENERAL" && p.tagId).map((p) => p.tagId!));
  // Preferencias por plato agrupadas por plato.
  const byDish = new Map<string, { dishId: string; dishName: string; restaurant: string; slug: string; options: { id: string; label: string }[] }>();
  for (const p of prefs) {
    if (p.scope !== "DISH" || !p.dish || !p.option || p.dish.deletedAt) continue;
    const entry = byDish.get(p.dish.id) ?? { dishId: p.dish.id, dishName: p.dish.name, restaurant: p.dish.restaurant.name, slug: p.dish.restaurant.slug, options: [] };
    entry.options.push({ id: p.id, label: `${p.option.group.name}: ${p.option.name}` });
    byDish.set(p.dish.id, entry);
  }
  return { tags, generalTagIds, dishPrefs: [...byDish.values()] };
}
