import { BellOff, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { markAllReadAction, openNotificationAction } from "@/modules/notifications/actions";
import { formatInboxDate } from "@/modules/notifications/format";
import type { InboxItem } from "@/modules/notifications/queries";

// Bandeja de notificaciones in-app. Tocar una la marca como leída y lleva al pedido.
export function NotificationInbox({ items, now }: { items: InboxItem[]; now: Date }) {
  const unread = items.filter((i) => !i.read).length;

  return (
    <section className="grid gap-3" aria-labelledby="inbox-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="inbox-title" className="text-lg font-semibold">
          Bandeja{unread > 0 ? <span className="ml-2 text-sm font-normal text-muted-foreground">{unread} sin leer</span> : null}
        </h2>
        {unread > 0 ? (
          <form action={markAllReadAction}>
            <Button type="submit" variant="ghost" size="sm">
              Marcar todas como leídas
            </Button>
          </form>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="grid place-items-center gap-2 rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          <BellOff className="size-6" aria-hidden />
          <p>Todavía no tenés notificaciones. Acá vas a ver las novedades de tus pedidos.</p>
        </div>
      ) : (
        <ul className="grid overflow-hidden rounded-xl border bg-card">
          {items.map((item) => (
            <li key={item.id} className="border-b last:border-b-0">
              <form action={openNotificationAction.bind(null, item.id)}>
                <button
                  type="submit"
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/60 focus-visible:bg-secondary focus-visible:outline-none",
                    !item.read && "bg-primary/5",
                  )}
                >
                  <span
                    className={cn("mt-1.5 size-2 shrink-0 rounded-full", item.read ? "bg-transparent" : "bg-primary")}
                    aria-hidden
                  />
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cn("truncate text-sm", item.read ? "font-medium" : "font-semibold")}>
                        {item.title}
                      </span>
                      <time dateTime={item.createdAt.toISOString()} className="shrink-0 text-xs text-muted-foreground">
                        {formatInboxDate(item.createdAt, now)}
                      </time>
                    </span>
                    <span className="text-sm text-muted-foreground">{item.body}</span>
                    {!item.read ? <span className="sr-only">Sin leer</span> : null}
                  </span>
                  <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
