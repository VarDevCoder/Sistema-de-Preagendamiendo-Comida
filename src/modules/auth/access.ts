import type { Role } from "@/generated/prisma/enums";

// Reglas de acceso por rol. Se usan en el proxy (chequeo optimista, rápido)
// y en la capa de datos (chequeo definitivo contra la base).

export const PUBLIC_LOGIN_PATH = "/ingresar";

const AREAS: { prefix: string; roles: Role[] }[] = [
  { prefix: "/admin", roles: ["SUPER_ADMIN"] },
  { prefix: "/panel", roles: ["RESTAURANT_ADMIN", "SUPER_ADMIN"] },
  { prefix: "/cuenta", roles: ["CUSTOMER", "RESTAURANT_ADMIN", "SUPER_ADMIN"] },
];

/** Página de inicio de cada rol después de iniciar sesión. */
export function homeForRole(role: Role): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "/admin";
    case "RESTAURANT_ADMIN":
      return "/panel";
    default:
      return "/";
  }
}

export function protectedArea(pathname: string) {
  return AREAS.find((a) => pathname === a.prefix || pathname.startsWith(`${a.prefix}/`)) ?? null;
}

export type AccessDecision = { allow: true } | { allow: false; redirectTo: string };

export function decideAccess(pathname: string, role: Role | null): AccessDecision {
  const area = protectedArea(pathname);
  if (!area) return { allow: true };
  if (!role) return { allow: false, redirectTo: `${PUBLIC_LOGIN_PATH}?callbackUrl=${encodeURIComponent(pathname)}` };
  if (!area.roles.includes(role)) return { allow: false, redirectTo: homeForRole(role) };
  return { allow: true };
}

/** Solo rutas internas: evita redirecciones abiertas a otros dominios. */
export function safeCallbackUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return null;
  }
  return value;
}
