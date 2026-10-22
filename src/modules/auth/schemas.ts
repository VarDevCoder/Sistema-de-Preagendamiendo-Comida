import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Ingresá un email válido" }));

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: "Ingresá tu contraseña" }),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, { error: "Ingresá tu nombre" }).max(80),
  email: emailSchema,
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^[+\d\s-]*$/, { error: "Teléfono inválido" })
    .optional()
    .transform((v) => (v ? v : undefined)),
  password: z
    .string()
    .min(8, { error: "La contraseña debe tener al menos 8 caracteres" })
    .max(72, { error: "La contraseña es demasiado larga" }), // límite de bcrypt
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
