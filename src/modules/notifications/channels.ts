import type { NotificationChannel } from "@/generated/prisma/enums";

// Qué canales corresponden para un destinatario.
// - IN_APP siempre (es la bandeja de /cuenta/notificaciones).
// - EMAIL si hay proveedor configurado y el usuario está activo.
// - PUSH si hay claves VAPID y el usuario tiene al menos un dispositivo suscripto.

export type ChannelInput = {
  userActive: boolean;
  email: string | null;
  emailEnabled: boolean;
  pushEnabled: boolean;
  pushSubscriptions: number;
};

export function selectChannels(input: ChannelInput): NotificationChannel[] {
  const channels: NotificationChannel[] = ["IN_APP"];
  if (!input.userActive) return channels;
  if (input.emailEnabled && input.email) channels.push("EMAIL");
  if (input.pushEnabled && input.pushSubscriptions > 0) channels.push("PUSH");
  return channels;
}
