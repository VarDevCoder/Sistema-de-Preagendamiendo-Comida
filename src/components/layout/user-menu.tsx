import Link from "next/link";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/modules/auth/session";
import { logoutAction } from "@/modules/auth/actions";

const ROLE_LINK = {
  CUSTOMER: { href: "/cuenta", label: "Mi cuenta" },
  RESTAURANT_ADMIN: { href: "/panel", label: "Mi restaurante" },
  SUPER_ADMIN: { href: "/admin", label: "Administración" },
} as const;

export async function UserMenu() {
  const user = await getSessionUser();
  if (!user) {
    return (
      <Button asChild size="sm">
        <Link href="/ingresar">Ingresar</Link>
      </Button>
    );
  }
  const link = ROLE_LINK[user.role];
  return (
    <div className="flex items-center gap-1">
      <Button asChild variant="ghost" size="sm">
        <Link href={link.href}>{link.label}</Link>
      </Button>
      <form action={logoutAction}>
        <Button type="submit" variant="ghost" size="icon" aria-label="Cerrar sesión" title="Cerrar sesión">
          <LogOut />
        </Button>
      </form>
    </div>
  );
}
