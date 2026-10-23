// Configuración de notificaciones desde variables de entorno (ver .env.example,
// sección "Notificaciones"). Se lee en cada llamada para que los tests puedan
// cambiar process.env y para que nada se congele en el build.

export type EmailProviderName = "console" | "resend" | "none";

type Env = Record<string, string | undefined>;

/**
 * EMAIL_PROVIDER explícito, o:
 * - "resend" si hay RESEND_API_KEY y EMAIL_FROM;
 * - "console" fuera de producción (los emails se imprimen en la consola);
 * - "none" en producción sin proveedor (no se loguean datos personales).
 */
export function emailProviderName(env: Env = process.env): EmailProviderName {
  const explicit = env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (explicit === "console" || explicit === "resend" || explicit === "none") return explicit;
  if (env.RESEND_API_KEY && env.EMAIL_FROM) return "resend";
  return env.NODE_ENV === "production" ? "none" : "console";
}

export type VapidConfig = { publicKey: string; privateKey: string; subject: string };

/** Claves VAPID completas, o null (push deshabilitado sin errores). */
export function vapidConfig(env: Env = process.env): VapidConfig | null {
  const publicKey = (env.VAPID_PUBLIC_KEY || env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

/** Clave pública para el navegador (no es secreta). */
export function vapidPublicKey(env: Env = process.env): string | null {
  return vapidConfig(env)?.publicKey ?? null;
}

/** URL absoluta de la app para los links de los emails. */
export function appBaseUrl(env: Env = process.env): string {
  const explicit = env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}
