import { Clock, Download, Lock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateLong, formatDateShort, formatInstantTime, FULFILLMENT_LABEL } from "@/modules/production/format";
import type { ProductionData } from "@/modules/production/queries";
import { formatMinute, todayKey } from "@/modules/shared/time";
import { AllergyFlag, NoteFlag } from "./flags";
import { PrintButton } from "./print-button";

// Estilos de impresión: solo la lista, sin la navegación del sitio ni del panel.
const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 12mm; }
  body > header, header[class*="sticky"], nav, [data-print-hide] { display: none !important; }
  main { max-width: none !important; padding: 0 !important; }
  .production-root { font-size: 11pt; }
  .production-root [data-slot="card"] { box-shadow: none; border-color: #000; }
  .production-combo, .production-alert { break-inside: avoid; }
  .production-dish { break-inside: auto; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;

export function ProductionView({ data, restaurantName, pdfHref }: { data: ProductionData; restaurantName: string; pdfHref: string }) {
  const { list } = data;
  // todayKey(instante) = día local (Asunción) de ese instante.
  const cutoffText = `${formatDateShort(todayKey(data.cutoffAt))} ${formatInstantTime(data.cutoffAt)}`;

  return (
    <div className="production-root grid gap-5">
      <style>{PRINT_CSS}</style>

      <div className="grid gap-1">
        <p className="hidden text-sm font-medium print:block">{restaurantName}</p>
        <h2 className="text-xl font-semibold first-letter:uppercase">{formatDateLong(data.date)}</h2>
        {data.state === "PROVISIONAL" ? (
          <Alert className="border-2 border-warning bg-warning/15">
            <Clock />
            <AlertTitle>Lista provisoria</AlertTitle>
            <AlertDescription>
              Hasta la hora de corte ({cutoffText}) todavía pueden entrar o cancelarse pedidos.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert className="border-2 border-success/60 bg-accent">
            <Lock />
            <AlertTitle>Lista cerrada</AlertTitle>
            <AlertDescription>Pasó la hora de corte ({cutoffText}): ya no entran pedidos nuevos para este día.</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="flex flex-wrap gap-2 print:hidden" data-print-hide>
        <PrintButton />
        <Button asChild variant="outline" size="sm">
          <a href={pdfHref} download>
            <Download />
            Descargar PDF
          </a>
        </Button>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Pedidos" value={list.totals.orders} />
        <Stat label="Unidades" value={list.totals.units} />
        <Stat label="Con alergias" value={list.totals.ordersWithAllergies} highlight={list.totals.ordersWithAllergies > 0} />
        <Stat label="Con notas" value={list.totals.ordersWithNotes} />
      </dl>

      {list.dishes.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">
          No hay pedidos confirmados para este día.
        </p>
      ) : (
        <>
          <section className="grid gap-2" aria-labelledby="totales-franja">
            <h3 id="totales-franja" className="font-semibold">
              Totales por franja
            </h3>
            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Franja</th>
                    <th className="px-3 py-2 text-right font-medium">Pedidos</th>
                    <th className="px-3 py-2 text-right font-medium">Unid.</th>
                    <th className="px-3 py-2 font-medium">Platos</th>
                  </tr>
                </thead>
                <tbody>
                  {list.slots.map((s) => (
                    <tr key={`${s.startMinute}-${s.endMinute}`} className="border-b last:border-0 align-top">
                      <td className="px-3 py-2 font-medium whitespace-nowrap tabular-nums">
                        {formatMinute(s.startMinute)}–{formatMinute(s.endMinute)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.orders}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.units}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {s.dishes.map((d) => `${d.dishName} ${d.quantity}`).join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {list.alerts.length > 0 ? (
            <section className="grid gap-2" aria-labelledby="alertas">
              <h3 id="alertas" className="font-semibold">
                Alergias y notas del día
              </h3>
              <ul className="grid gap-2 sm:grid-cols-2">
                {list.alerts.map((a) => (
                  <li key={a.orderId} className="production-alert grid gap-1 rounded-xl border bg-card p-3 text-sm">
                    <p>
                      <span className="font-mono font-semibold">{a.code}</span> · {a.customerName} ·{" "}
                      <span className="tabular-nums">{formatMinute(a.slotStartMinute)}</span>
                    </p>
                    <AllergyFlag allergens={a.allergens} other={a.allergyOther} />
                    {a.notes.map((n, i) => (
                      <NoteFlag key={i} label={`Nota (${n.dishName})`} text={n.text} />
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="grid gap-4 lg:grid-cols-2 lg:items-start print:block" aria-label="Detalle por plato">
            {list.dishes.map((d) => (
              <article key={d.dishId} className="production-dish grid gap-3 rounded-xl border bg-card p-4 print:mb-4">
                <header className="grid gap-1">
                  <h3 className="text-lg font-semibold">
                    {d.dishName} <span className="tabular-nums">× {d.total}</span>
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {d.combos
                      .map((c) => `${c.total} ${c.summary || "sin modificadores"}`)
                      .join(" · ")}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {d.bySlot.map((s) => (
                      <Badge key={s.startMinute} variant="secondary" className="tabular-nums">
                        {formatMinute(s.startMinute)} · {s.quantity}
                      </Badge>
                    ))}
                  </div>
                </header>
                {d.combos.map((c) => (
                  <div key={c.modifierKey} className="production-combo grid gap-2 rounded-lg border bg-background p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-semibold">
                        <span className="tabular-nums">{c.total} ×</span> {c.summary || "Sin modificadores"}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {c.hasAllergy ? <Badge variant="destructive">Alergias</Badge> : null}
                        {c.hasNotes ? <Badge variant="warning">Notas</Badge> : null}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      Por franja: {c.bySlot.map((s) => `${formatMinute(s.startMinute)} (${s.quantity})`).join(" · ")}
                    </p>
                    <ul className="grid gap-1.5">
                      {c.orders.map((o) => (
                        <li key={o.orderId} className="grid gap-1 border-t pt-1.5 text-sm first:border-t-0 first:pt-0">
                          <div className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-2">
                            <span className="font-semibold tabular-nums">{o.quantity}×</span>
                            <span className="min-w-0 truncate">
                              <span className="font-mono">{o.code}</span> · {o.customerName}
                            </span>
                            <span className="text-muted-foreground tabular-nums">
                              {formatMinute(o.slotStartMinute)} · {FULFILLMENT_LABEL[o.fulfillment]}
                              {o.kind === "PLAN_DAY" ? " · Plan" : ""}
                            </span>
                          </div>
                          <AllergyFlag allergens={o.allergens} other={o.allergyOther} />
                          <NoteFlag text={o.notes} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </article>
            ))}
          </section>
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Generada {formatInstantTime(data.generatedAt)} · cuentan pedidos confirmados, en preparación, listos y entregados (incluye días de
        plan mensual).
      </p>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border bg-card px-3 py-2 ${highlight ? "border-2 border-destructive" : ""}`}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
