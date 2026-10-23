import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader, SectionSkeleton } from "@/components/layout/page-header";
import { ClaimActions } from "@/components/panel-ops/claim-actions";
import { ClaimStatusBadge } from "@/components/panel-ops/claim-status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { requireUser } from "@/modules/auth/session";
import { listClaims } from "@/modules/claims/queries";
import { FULFILLMENT_LABEL, formatDateShort } from "@/modules/production/format";
import { CLAIM_REASON_LABEL } from "@/modules/shared/labels";
import { formatGs } from "@/modules/shared/money";
import { dbDateToKey, formatMinute } from "@/modules/shared/time";

export const metadata: Metadata = { title: "Reclamos" };

const FILTERS = [
  { key: "open", label: "Abiertos" },
  { key: "closed", label: "Cerrados" },
  { key: "all", label: "Todos" },
] as const;

type Filter = (typeof FILTERS)[number]["key"];

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function AdminClaimsPage({ searchParams }: Props) {
  return (
    <>
      <PageHeader title="Reclamos" description="Disputas de clientes, con reembolso opcional a la billetera." />
      <Suspense fallback={<SectionSkeleton />}>
        <ClaimsList searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ClaimsList({ searchParams }: Props) {
  await requireUser(["SUPER_ADMIN"]);
  const raw = (await searchParams).estado;
  const filter: Filter = raw === "closed" || raw === "all" ? raw : "open";
  const claims = await listClaims(filter);

  return (
    <div className="grid gap-4">
      <nav aria-label="Filtro" className="inline-flex h-10 w-fit items-center rounded-lg bg-muted p-1 text-sm">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/admin/reclamos?estado=${f.key}`}
            aria-current={f.key === filter ? "page" : undefined}
            className={cn(
              "inline-flex h-full items-center rounded-md px-3 font-medium text-muted-foreground",
              f.key === filter && "bg-card text-foreground shadow-sm",
            )}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {claims.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">Sin reclamos en este filtro.</CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {claims.map((c) => (
            <Card key={c.id}>
              <CardContent className="grid gap-3 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="grid gap-0.5">
                    <p className="font-medium">
                      {c.restaurant.name} <span className="font-normal text-muted-foreground">· pedido {c.order.code}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {c.customer.name ?? c.customer.email} · {formatDateShort(dbDateToKey(c.order.serviceDate))} {formatMinute(c.order.slotStartMinute)} ·{" "}
                      {FULFILLMENT_LABEL[c.order.fulfillment]}
                    </p>
                  </div>
                  <ClaimStatusBadge status={c.status} />
                </div>

                <div className="grid gap-1 text-sm">
                  <p>
                    <span className="font-medium">{CLAIM_REASON_LABEL[c.reason]}</span> · Total del pedido {formatGs(c.order.total)}
                  </p>
                  <p className="text-muted-foreground">{c.description}</p>
                  <ul className="text-muted-foreground">
                    {c.order.items.map((it) => (
                      <li key={it.id}>
                        {it.quantity}× {it.dishName}
                        {it.modifierSummary ? ` · ${it.modifierSummary}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>

                {c.resolution ? (
                  <div className="grid gap-0.5 rounded-lg border bg-muted/30 p-3 text-sm">
                    <p className="font-medium">Resolución</p>
                    <p className="text-muted-foreground">{c.resolution}</p>
                    {c.refundAmount ? <p className="text-muted-foreground">Reembolsado: {formatGs(c.refundAmount)}</p> : null}
                  </div>
                ) : (
                  <ClaimActions claimId={c.id} status={c.status} maxRefund={c.maxRefund} code={c.order.code} />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
