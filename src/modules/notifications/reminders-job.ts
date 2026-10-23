import { db } from "@/lib/db";
import { dateKeyToDb, type DateKey } from "@/modules/shared/time";
import { reminderServiceDate } from "./reminders";
import { deliverNotification } from "./service";

export type ReminderRunReport = {
  serviceDate: DateKey;
  orders: number;
  notified: number; // pedidos con al menos una notificación creada en esta corrida
  alreadyNotified: number; // ya recordados en una corrida anterior (dedupeKey)
  failedChannels: number;
  errors: number;
};

const CONCURRENCY = 8;

/**
 * Recordatorio del día anterior para los pedidos CONFIRMED de mañana
 * (America/Asuncion). Idempotente: correrlo dos veces no duplica nada porque
 * cada recordatorio tiene dedupeKey "ORDER_REMINDER:<orderId>:<canal>".
 */
export async function sendOrderReminders(now: Date = new Date()): Promise<ReminderRunReport> {
  const serviceDate = reminderServiceDate(now);
  const orders = await db.order.findMany({
    where: { serviceDate: dateKeyToDb(serviceDate), status: "CONFIRMED" },
    select: { id: true },
    orderBy: { id: "asc" },
  });

  const report: ReminderRunReport = {
    serviceDate,
    orders: orders.length,
    notified: 0,
    alreadyNotified: 0,
    failedChannels: 0,
    errors: 0,
  };

  // Lotes chicos: no saturar el pool de conexiones ni el proveedor de email.
  for (let i = 0; i < orders.length; i += CONCURRENCY) {
    const batch = orders.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((o) => deliverNotification({ type: "ORDER_REMINDER", orderId: o.id })));
    for (const r of results) {
      if (r.error) report.errors++;
      else if (r.created.length > 0) report.notified++;
      else report.alreadyNotified++;
      report.failedChannels += r.failed.length;
    }
  }
  return report;
}
