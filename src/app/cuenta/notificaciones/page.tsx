import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader, SectionSkeleton } from "@/components/layout/page-header";
import { NotificationInbox } from "@/components/notifications/inbox";
import { PushToggle } from "@/components/notifications/push-toggle";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/modules/auth/session";
import { vapidPublicKey } from "@/modules/notifications/config";
import { listInbox } from "@/modules/notifications/queries";

export const metadata: Metadata = { title: "Notificaciones" };

export default function NotificationsPage() {
  return (
    <>
      <PageHeader title="Notificaciones" description="Avisos de tus pedidos, planes y billetera." />
      <Suspense fallback={<SectionSkeleton />}>
        <NotificationsContent />
      </Suspense>
    </>
  );
}

async function NotificationsContent() {
  const user = await requireUser();
  const items = await listInbox(user.id);
  return (
    <div className="grid gap-6">
      <Card>
        <CardContent>
          <PushToggle vapidPublicKey={vapidPublicKey()} />
        </CardContent>
      </Card>
      <NotificationInbox items={items} now={new Date()} />
    </div>
  );
}
