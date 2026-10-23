import { randomInt } from "node:crypto";

// Código corto y legible para cocina y atención ("K7P-4QX"): sin 0/O, 1/I/L.
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateOrderCode(): string {
  const raw = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
  return `${raw.slice(0, 3)}-${raw.slice(3)}`;
}

export function isOrderCode(s: string): boolean {
  return /^[A-Z2-9]{3}-[A-Z2-9]{3}$/.test(s);
}
