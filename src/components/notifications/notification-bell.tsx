import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { countUnread } from "@/modules/notifications/queries";

// Campana con la cantidad de notificaciones sin leer, para el header.
// Es async (lee la base): usarla dentro de <Suspense>, con el id del usuario ya resuelto.
export async function NotificationBell({ userId }: { userId: string }) {
  const unread = await countUnread(userId);
  const label = unread > 0 ? `Notificaciones (${unread} sin leer)` : "Notificaciones";
  return (
    <Button asChild variant="ghost" size="icon" className="relative" aria-label={label} title={label}>
      <Link href="/cuenta/notificaciones">
        <Bell />
        {unread > 0 ? (
          <span className="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}
