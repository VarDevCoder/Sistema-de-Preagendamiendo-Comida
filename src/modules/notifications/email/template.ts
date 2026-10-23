import { brand } from "@/lib/brand";
import type { NotificationContent } from "../content";

// Plantilla de email: HTML simple con estilos inline (lo que soportan los
// clientes de correo) y versión de texto plano.

export type RenderedEmail = { subject: string; html: string; text: string };

const PRIMARY = "#db5612";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderEmail(
  content: NotificationContent,
  opts: { baseUrl: string; recipientName?: string | null },
): RenderedEmail {
  const link = `${opts.baseUrl}${content.url}`;
  const firstName = opts.recipientName?.trim().split(/\s+/)[0];
  const greeting = firstName ? `Hola ${firstName},` : "Hola,";
  const settingsLink = `${opts.baseUrl}/cuenta/notificaciones`;

  const text = [
    greeting,
    "",
    content.body,
    "",
    `${content.cta}: ${link}`,
    "",
    "—",
    `${brand.name} · ${brand.tagline}`,
    `Configurá tus avisos en ${settingsLink}`,
  ].join("\n");

  const html = `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(content.title)}</title></head>
<body style="margin:0;padding:0;background:#fdfbf7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#2b1d15;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fdfbf7;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #ece4d8;border-radius:16px;">
        <tr><td style="padding:20px 24px;border-bottom:1px solid #ece4d8;font-weight:600;font-size:16px;">
          <span style="display:inline-block;width:24px;height:24px;border-radius:6px;background:${PRIMARY};vertical-align:middle;"></span>
          <span style="vertical-align:middle;margin-left:8px;">${escapeHtml(brand.name)}</span>
        </td></tr>
        <tr><td style="padding:24px;">
          <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;">${escapeHtml(content.title)}</h1>
          <p style="margin:0 0 8px;font-size:15px;line-height:1.5;">${escapeHtml(greeting)}</p>
          <p style="margin:0 0 20px;font-size:15px;line-height:1.5;">${escapeHtml(content.body)}</p>
          <a href="${escapeHtml(link)}" style="display:inline-block;background:${PRIMARY};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;font-size:15px;">${escapeHtml(content.cta)}</a>
        </td></tr>
        <tr><td style="padding:16px 24px;border-top:1px solid #ece4d8;font-size:12px;color:#7a6a5c;line-height:1.5;">
          ${escapeHtml(brand.name)} · ${escapeHtml(brand.tagline)}<br>
          <a href="${escapeHtml(settingsLink)}" style="color:#7a6a5c;">Configurá tus avisos</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject: content.title, html, text };
}
