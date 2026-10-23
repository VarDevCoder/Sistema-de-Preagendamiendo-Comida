// Dispara una notificación a mano (desarrollo / soporte).
// Uso:
//   npx tsx scripts/notify.ts ORDER_CONFIRMED <código o id del pedido>
//   npx tsx scripts/notify.ts ORDER_REMINDER  <código o id del pedido>
//   npx tsx scripts/notify.ts recordatorios         (corre el cron de recordatorios)
// Respeta la deduplicación: repetir el mismo comando no vuelve a enviar.
import "dotenv/config";
import { db } from "../src/lib/db";
import { notify, type NotificationEvent } from "../src/modules/notifications/events";
import { sendOrderReminders } from "../src/modules/notifications/reminders-job";

const ORDER_EVENTS = ["ORDER_CONFIRMED", "ORDER_REMINDER", "ORDER_READY", "ORDER_CANCELLED", "PLAN_DAY_CHANGED"] as const;
type OrderEventType = (typeof ORDER_EVENTS)[number];

async function main() {
  const [type, ref] = process.argv.slice(2);
  if (type === "recordatorios") {
    console.log(await sendOrderReminders());
    return;
  }
  if (!ORDER_EVENTS.includes(type as OrderEventType) || !ref) {
    console.error(`Uso: npx tsx scripts/notify.ts <${ORDER_EVENTS.join("|")}> <código o id>  |  recordatorios`);
    process.exitCode = 1;
    return;
  }
  const order = await db.order.findFirst({ where: { OR: [{ id: ref }, { code: ref }] }, select: { id: true, code: true } });
  if (!order) throw new Error(`No existe el pedido ${ref}`);
  const event = { type, orderId: order.id } as NotificationEvent;
  await notify(event);
  const rows = await db.notification.findMany({
    where: { orderId: order.id, type: type as OrderEventType },
    select: { channel: true, status: true, dedupeKey: true, error: true },
    orderBy: { channel: "asc" },
  });
  console.table(rows);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
