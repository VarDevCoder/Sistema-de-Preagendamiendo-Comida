import "server-only";
import { db } from "@/lib/db";

// Lecturas del menú para el panel del restaurante (siempre filtradas por restaurantId).

export async function getMenuOverview(restaurantId: string) {
  const [categories, dishes] = await Promise.all([
    db.menuCategory.findMany({
      where: { restaurantId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { dishes: { where: { deletedAt: null } } } } },
    }),
    db.dish.findMany({
      where: { restaurantId, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { modifierGroups: true } } },
    }),
  ]);
  return { categories, dishes };
}

export async function getDishForEdit(restaurantId: string, dishId: string) {
  const dish = await db.dish.findFirst({
    where: { id: dishId, restaurantId, deletedAt: null },
    include: {
      modifierGroups: {
        where: { group: { deletedAt: null } },
        orderBy: [{ sortOrder: "asc" }],
        include: {
          group: {
            include: { options: { where: { deletedAt: null }, orderBy: { sortOrder: "asc" }, select: { name: true, isActive: true } } },
          },
        },
      },
    },
  });
  return dish;
}

export async function getMenuFormData(restaurantId: string) {
  const [categories, groups] = await Promise.all([
    db.menuCategory.findMany({ where: { restaurantId }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    db.modifierGroup.findMany({
      where: { restaurantId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, required: true, minSelect: true, maxSelect: true },
    }),
  ]);
  return { categories, groups };
}

export async function getModifierGroups(restaurantId: string) {
  const [groups, tags] = await Promise.all([
    db.modifierGroup.findMany({
      where: { restaurantId, deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        options: { where: { deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { preferenceTag: true } },
        dishes: { where: { dish: { deletedAt: null } }, include: { dish: { select: { id: true, name: true } } } },
      },
    }),
    db.preferenceTag.findMany({ orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { label: "asc" }] }),
  ]);
  return { groups, tags };
}
