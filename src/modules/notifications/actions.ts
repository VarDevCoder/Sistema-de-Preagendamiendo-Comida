"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/modules/auth/session";
import { safeInternalPath } from "./http";

const INBOX_PATH = "/cuenta/notificaciones";

export async function markAllReadAction(): Promise<void> {
  const user = await requireUser();
  await db.notification.updateMany({
    where: { userId: user.id, channel: "IN_APP", readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath(INBOX_PATH);
}

const idSchema = z.string().min(1).max(64);

/** Marca como leída y lleva al destino de la notificación (pedido, plan, billetera). */
export async function openNotificationAction(id: string): Promise<void> {
  const user = await requireUser();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) redirect(INBOX_PATH);
  const row = await db.notification.findFirst({
    where: { id: parsed.data, userId: user.id, channel: "IN_APP" },
    select: { id: true, data: true, readAt: true },
  });
  if (!row) redirect(INBOX_PATH);
  if (!row.readAt) await db.notification.update({ where: { id: row.id }, data: { readAt: new Date() } });
  redirect(safeInternalPath((row.data as { url?: unknown } | null)?.url, INBOX_PATH));
}
