import { db } from "@/lib/db";
import { safeInternalPath } from "./http";

// Bandeja in-app del usuario (solo canal IN_APP: los otros canales son copias).

export type InboxItem = {
  id: string;
  title: string;
  body: string;
  url: string;
  createdAt: Date;
  read: boolean;
};

export async function listInbox(userId: string, limit = 50): Promise<InboxItem[]> {
  const rows = await db.notification.findMany({
    where: { userId, channel: "IN_APP" },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, title: true, body: true, data: true, createdAt: true, readAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    url: safeInternalPath((r.data as { url?: unknown } | null)?.url),
    createdAt: r.createdAt,
    read: r.readAt !== null,
  }));
}

export function countUnread(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, channel: "IN_APP", readAt: null } });
}

export async function pushDeviceCount(userId: string): Promise<number> {
  return db.pushSubscription.count({ where: { userId } });
}
