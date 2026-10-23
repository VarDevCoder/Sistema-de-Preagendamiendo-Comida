import { createHmac, timingSafeEqual } from "node:crypto";

// Firma HMAC-SHA256 del cuerpo CRUDO del webhook. Se verifica antes de parsear
// el JSON y con comparación en tiempo constante.

export const SIGNATURE_HEADER = "x-mock-signature";

export function signBody(secret: string, body: string): string {
  if (!secret) throw new Error("Falta el secreto de firma de webhooks");
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

export function verifyBodySignature(secret: string, body: string, header: string | null | undefined): boolean {
  if (!secret || !header) return false;
  const expected = Buffer.from(signBody(secret, body));
  const received = Buffer.from(header.trim());
  return expected.length === received.length && timingSafeEqual(expected, received);
}
