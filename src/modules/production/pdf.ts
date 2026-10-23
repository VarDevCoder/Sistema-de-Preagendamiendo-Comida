import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatMinute } from "@/modules/shared/time";
import { allergyText, formatDateLong, formatInstant, formatInstantTime, FULFILLMENT_LABEL } from "./format";
import type { ProductionList } from "./grouping";

// PDF de la lista de producción, generado en el servidor con pdf-lib (JS puro:
// funciona en Vercel serverless sin binarios ni fuentes externas). Usa las
// fuentes estándar del PDF (Helvetica, codificación WinAnsi): los caracteres
// fuera de ese juego se reemplazan para que nunca falle la generación.

export type ProductionPdfInput = {
  restaurantName: string;
  date: string;
  state: "PROVISIONAL" | "CLOSED";
  cutoffAt: Date;
  generatedAt: Date;
  list: ProductionList;
};

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 40;
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.4, 0.4, 0.4);
const ALERT_BG = rgb(0.98, 0.88, 0.86);
const ALERT_INK = rgb(0.6, 0.08, 0.05);
const NOTE_BG = rgb(0.99, 0.95, 0.8);
const RULE = rgb(0.8, 0.8, 0.8);

const REPLACEMENTS: Record<string, string> = {
  "→": "->",
  "←": "<-",
  "≥": ">=",
  "≤": "<=",
  "✓": "v",
  "⚠": "!",
};

/** Deja el texto dentro del juego de caracteres de la fuente (quita tildes solo si hace falta). */
export function makeSanitizer(supported: Set<number>) {
  return (text: string): string => {
    let out = "";
    for (const ch of text.replace(/\s+/g, " ")) {
      const code = ch.codePointAt(0)!;
      if (supported.has(code)) out += ch;
      else if (REPLACEMENTS[ch]) out += REPLACEMENTS[ch];
      else {
        const base = ch.normalize("NFKD").replace(/[̀-ͯ]/g, "");
        out += base && [...base].every((c) => supported.has(c.codePointAt(0)!)) ? base : "?";
      }
    }
    return out;
  };
}

export async function renderProductionPdf(input: ProductionPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Lista de producción ${input.date} · ${input.restaurantName}`);
  doc.setCreator("Prepago");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const clean = makeSanitizer(new Set(regular.getCharacterSet()));

  let page: PDFPage = doc.addPage(A4);
  let y = A4[1] - MARGIN;
  const width = A4[0] - MARGIN * 2;

  const newPage = () => {
    page = doc.addPage(A4);
    y = A4[1] - MARGIN;
  };
  const ensure = (h: number) => {
    if (y - h < MARGIN + 14) newPage();
  };

  const wrap = (text: string, font: PDFFont, size: number, maxWidth: number): string[] => {
    const words = clean(text).split(" ");
    const lines: string[] = [];
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) <= maxWidth || !line) line = next;
      else {
        lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  /** Escribe un párrafo (con salto de página si hace falta) y devuelve la altura usada. */
  const write = (
    text: string,
    opts: { size?: number; font?: PDFFont; x?: number; maxWidth?: number; color?: ReturnType<typeof rgb>; gap?: number } = {},
  ) => {
    const size = opts.size ?? 10;
    const font = opts.font ?? regular;
    const x = opts.x ?? MARGIN;
    const lineH = size * 1.3;
    for (const line of wrap(text, font, size, opts.maxWidth ?? width - (x - MARGIN))) {
      ensure(lineH);
      page.drawText(line, { x, y: y - size, size, font, color: opts.color ?? INK });
      y -= lineH;
    }
    y -= opts.gap ?? 0;
  };

  const rule = () => {
    ensure(8);
    page.drawLine({ start: { x: MARGIN, y: y - 2 }, end: { x: MARGIN + width, y: y - 2 }, thickness: 0.6, color: RULE });
    y -= 8;
  };

  const { list } = input;

  // Encabezado
  write(input.restaurantName, { size: 16, font: bold });
  write(`Lista de producción · ${formatDateLong(input.date)}`, { size: 12, font: bold, gap: 2 });
  write(
    input.state === "CLOSED"
      ? `LISTA CERRADA (corte: ${formatInstant(input.cutoffAt)})`
      : `LISTA PROVISORIA: todavía pueden entrar pedidos hasta el corte (${formatInstant(input.cutoffAt)})`,
    { size: 10, font: bold, color: input.state === "CLOSED" ? INK : ALERT_INK },
  );
  write(
    `${list.totals.orders} pedidos · ${list.totals.units} unidades · ${list.totals.ordersWithAllergies} con alergias · generado ${formatInstant(input.generatedAt)}`,
    { size: 9, color: MUTED, gap: 6 },
  );

  if (list.dishes.length === 0) {
    write("No hay pedidos confirmados para este día.", { size: 11 });
    return doc.save();
  }

  // Totales por plato
  write("Totales por plato", { size: 12, font: bold, gap: 2 });
  for (const d of list.dishes) {
    ensure(14);
    page.drawText(clean(d.dishName), { x: MARGIN, y: y - 10, size: 10, font: regular, color: INK });
    const qty = `${d.total}`;
    page.drawText(qty, { x: MARGIN + width - bold.widthOfTextAtSize(qty, 10), y: y - 10, size: 10, font: bold, color: INK });
    y -= 14;
  }
  y -= 4;

  // Totales por franja
  write("Totales por franja", { size: 12, font: bold, gap: 2 });
  for (const s of list.slots) {
    write(
      `${formatMinute(s.startMinute)}–${formatMinute(s.endMinute)}: ${s.orders} pedidos, ${s.units} u. — ${s.dishes
        .map((d) => `${d.dishName} ${d.quantity}`)
        .join(", ")}`,
      { size: 10 },
    );
  }
  y -= 4;

  // Alergias y notas (resumen destacado)
  if (list.alerts.length) {
    write("Alergias y notas", { size: 12, font: bold, gap: 2 });
    for (const a of list.alerts) {
      const allergy = allergyText(a.allergens, a.allergyOther);
      const parts = [`${a.code} · ${a.customerName} · ${formatMinute(a.slotStartMinute)}`];
      if (allergy) parts.push(`ALERGIA: ${allergy}`);
      for (const n of a.notes) parts.push(`NOTA (${n.dishName}): ${n.text}`);
      const lines = wrap(parts.join(" | "), bold, 9, width - 12);
      const h = lines.length * 11.7 + 6;
      ensure(h);
      page.drawRectangle({
        x: MARGIN,
        y: y - h,
        width,
        height: h,
        color: allergy ? ALERT_BG : NOTE_BG,
        borderColor: allergy ? ALERT_INK : MUTED,
        borderWidth: allergy ? 1.2 : 0.6,
      });
      let ly = y - 3;
      for (const line of lines) {
        page.drawText(line, { x: MARGIN + 6, y: ly - 9, size: 9, font: bold, color: allergy ? ALERT_INK : INK });
        ly -= 11.7;
      }
      y -= h + 3;
    }
    y -= 4;
  }

  // Detalle por plato y combinación
  for (const d of list.dishes) {
    ensure(60);
    rule();
    write(`${d.dishName} × ${d.total}`, { size: 14, font: bold, gap: 2 });
    for (const c of d.combos) {
      ensure(40);
      write(`${c.total} × ${c.summary || "Sin modificadores"}`, { size: 11, font: bold, x: MARGIN + 8 });
      write(
        `Por franja: ${c.bySlot.map((s) => `${formatMinute(s.startMinute)} (${s.quantity})`).join(" · ")}`,
        { size: 9, color: MUTED, x: MARGIN + 8 },
      );
      for (const o of c.orders) {
        const allergy = allergyText(o.allergens, o.allergyOther);
        const base = `${o.quantity} × ${o.code} · ${o.customerName} · ${formatMinute(o.slotStartMinute)} · ${FULFILLMENT_LABEL[o.fulfillment]}${o.kind === "PLAN_DAY" ? " · Plan" : ""}`;
        write(base, { size: 9.5, x: MARGIN + 20 });
        if (allergy) write(`!! ALERGIA: ${allergy}`, { size: 9.5, font: bold, x: MARGIN + 32, color: ALERT_INK });
        if (o.notes) write(`NOTA: ${o.notes}`, { size: 9.5, font: bold, x: MARGIN + 32 });
      }
      y -= 4;
    }
  }

  // Pie con número de página
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const footer = clean(`${input.restaurantName} · ${input.date} · generado ${formatInstantTime(input.generatedAt)} · página ${i + 1} de ${pages.length}`);
    p.drawText(footer, { x: MARGIN, y: MARGIN - 16, size: 8, font: regular, color: MUTED });
  });

  return doc.save();
}
