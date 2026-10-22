import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import type { Role } from "@/generated/prisma/enums";
import { homeForRole, PUBLIC_LOGIN_PATH } from "./access";

// Capa de acceso a datos (DAL) de autenticación. Es la autorización definitiva:
// revalida contra la base (usuario activo, rol actual) en cada request.
// Con cacheComponents, leer la sesión es dinámico: llamar dentro de <Suspense>.

export type SessionUser = { id: string; name: string | null; email: string; role: Role };

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  await connection();
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
});

/** Exige sesión (y opcionalmente uno de los roles). Si no, redirige. */
export async function requireUser(roles?: Role[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(PUBLIC_LOGIN_PATH);
  if (roles && !roles.includes(user.role)) redirect(homeForRole(user.role));
  return user;
}

/** Restaurantes que administra el usuario (el super admin ve todos). */
export async function getManagedRestaurants(user: SessionUser) {
  return db.restaurant.findMany({
    where: user.role === "SUPER_ADMIN" ? {} : { members: { some: { userId: user.id } } },
    select: { id: true, slug: true, name: true, status: true },
    orderBy: { name: "asc" },
  });
}

/** Exige que el usuario administre ese restaurante. */
export async function requireRestaurantAccess(restaurantId: string): Promise<SessionUser> {
  const user = await requireUser(["RESTAURANT_ADMIN", "SUPER_ADMIN"]);
  if (user.role === "SUPER_ADMIN") return user;
  const member = await db.restaurantMember.findUnique({
    where: { userId_restaurantId: { userId: user.id, restaurantId } },
  });
  if (!member) redirect("/panel");
  return user;
}

/**
 * Para rutas /panel/[slug]/…: exige sesión de restaurante (o super admin) con
 * acceso a ESE restaurante. Si no, redirige. Devuelve usuario y restaurante.
 */
export async function requireRestaurantBySlug(slug: string) {
  const user = await requireUser(["RESTAURANT_ADMIN", "SUPER_ADMIN"]);
  const restaurant = await db.restaurant.findUnique({ where: { slug } });
  if (!restaurant) redirect("/panel");
  if (user.role !== "SUPER_ADMIN") {
    const member = await db.restaurantMember.findUnique({
      where: { userId_restaurantId: { userId: user.id, restaurantId: restaurant.id } },
    });
    if (!member) redirect("/panel");
  }
  return { user, restaurant };
}
