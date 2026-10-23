import { z } from "zod";

// Body de /api/push/suscribir: el JSON de PushSubscription.toJSON() del navegador.
// Solo se aceptan endpoints https (los servicios de push reales siempre lo son)
// para que nadie pueda usar el servidor para hacer requests a URLs arbitrarias.
const base64url = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+={0,2}$/, "Clave inválida");

export const pushSubscriptionSchema = z.object({
  endpoint: z
    .url({ protocol: /^https$/, error: "El endpoint debe ser una URL https" })
    .max(2048),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: base64url, auth: base64url }),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const pushUnsubscribeSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }).max(2048),
});
