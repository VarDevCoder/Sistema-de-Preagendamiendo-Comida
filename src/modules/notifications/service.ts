import { appBaseUrl } from "./config";
import { getEmailProvider } from "./email/providers";
import type { NotificationEvent } from "./events";
import { createNotifier, type DeliveryReport } from "./notifier";
import { getPushSender } from "./push/sender";
import { resolveEvent } from "./resolve";
import { prismaNotificationStore } from "./store";

// Notificador real (Prisma + proveedores según el entorno). Se arma una vez por
// proceso; la configuración se lee del entorno en ese momento.
let notifier: ReturnType<typeof createNotifier> | null = null;

function getNotifier() {
  notifier ??= createNotifier({
    resolve: resolveEvent,
    store: prismaNotificationStore,
    email: getEmailProvider(),
    push: getPushSender(),
    baseUrl: appBaseUrl(),
  });
  return notifier;
}

/** Envía y espera (lo usan el cron y los scripts). Nunca lanza. */
export function deliverNotification(event: NotificationEvent): Promise<DeliveryReport> {
  return getNotifier()(event);
}
