import { timingSafeEqual } from "node:crypto";
import { safeCallbackUrl } from "@/modules/auth/access";

// Chequeos HTTP compartidos por los route handlers de notificaciones.

/** Vercel Cron manda "Authorization: Bearer $CRON_SECRET". Sin secreto configurado, se rechaza todo. */
export function isAuthorizedCron(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(authorization);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * Defensa CSRF para endpoints JSON autenticados por cookie: exige
 * Content-Type JSON (un formulario de otro sitio no puede mandarlo sin preflight)
 * y, si el navegador manda Origin, que coincida con el host.
 */
export function isSameOriginJson(headers: Headers, requestUrl: string): boolean {
  const contentType = headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) return false;
  const origin = headers.get("origin");
  if (!origin) return true;
  try {
    const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? new URL(requestUrl).host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Solo rutas internas ("/cuenta/…"), nunca "//otro-sitio" ni URLs absolutas. */
export function safeInternalPath(url: unknown, fallback = "/cuenta/notificaciones"): string {
  return safeCallbackUrl(url) ?? fallback;
}
