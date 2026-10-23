import { db } from "@/lib/db";
import type { NotificationStore } from "./notifier";

// Implementación de NotificationStore con Prisma.
export const prismaNotificationStore: NotificationStore = {
  countPushSubscriptions: (userId) => db.pushSubscription.count({ where: { userId } }),

  listPushSubscriptions: (userId) =>
    db.pushSubscription.findMany({
      where: { userId },
      select: { endpoint: true, p256dh: true, auth: true },
    }),

  async deletePushSubscription(endpoint) {
    await db.pushSubscription.deleteMany({ where: { endpoint } });
  },

  // INSERT … ON CONFLICT ("dedupeKey") DO NOTHING RETURNING: dos llamadas
  // concurrentes con el mismo hecho crean una sola fila y solo una envía.
  insertNew: (rows) =>
    db.notification.createManyAndReturn({
      data: rows,
      skipDuplicates: true,
      select: { id: true, channel: true },
    }),

  async markSent(id, at) {
    await db.notification.update({ where: { id }, data: { status: "SENT", sentAt: at, error: null } });
  },

  async markFailed(id, error) {
    await db.notification.update({ where: { id }, data: { status: "FAILED", error } });
  },
};
