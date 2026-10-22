"use server";

import { connection } from "next/server";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { db } from "@/lib/db";
import { homeForRole, safeCallbackUrl } from "./access";
import { hashPassword } from "./password";
import { loginSchema, registerSchema } from "./schemas";

export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  values?: Record<string, string>;
};

// Para OAuth (navegación completa) el destino se resuelve en /ir según el rol.
const AFTER_OAUTH = "/ir";

// Auth.js genera valores aleatorios (CSRF, ids). Con Cache Components hay que
// declarar antes que la ejecución es por request: `await connection()`.

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await connection();
  const values = { email: String(formData.get("email") ?? "") };
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) {
    return { fieldErrors: flatten(parsed.error), values };
  }
  // El destino por defecto depende del rol. Si el email no existe, signIn falla igual.
  const account = await db.user.findUnique({ where: { email: parsed.data.email }, select: { role: true } });
  const redirectTo = safeCallbackUrl(formData.get("callbackUrl")) ?? homeForRole(account?.role ?? "CUSTOMER");
  try {
    await signIn("credentials", { ...parsed.data, redirectTo });
  } catch (error) {
    // signIn lanza un redirect cuando sale bien: hay que dejarlo pasar.
    if (error instanceof AuthError) return { error: "Email o contraseña incorrectos.", values };
    throw error;
  }
  return {};
}

export async function registerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await connection();
  const raw = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    password: String(formData.get("password") ?? ""),
  };
  const values = { name: raw.name, email: raw.email, phone: raw.phone };
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: flatten(parsed.error), values };

  const { name, email, phone, password } = parsed.data;
  const exists = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (exists) return { fieldErrors: { email: ["Ya existe una cuenta con ese email."] }, values };

  await db.user.create({
    data: {
      name,
      email,
      phone,
      passwordHash: await hashPassword(password),
      role: "CUSTOMER",
      customerProfile: { create: {} },
    },
  });

  try {
    await signIn("credentials", { email, password, redirectTo: safeCallbackUrl(formData.get("callbackUrl")) ?? "/" });
  } catch (error) {
    if (error instanceof AuthError) return { error: "Tu cuenta se creó, pero no pudimos iniciar sesión. Probá ingresar." };
    throw error;
  }
  return {};
}

export async function googleSignInAction(formData: FormData) {
  await connection();
  await signIn("google", { redirectTo: safeCallbackUrl(formData.get("callbackUrl")) ?? AFTER_OAUTH });
}

export async function logoutAction() {
  await connection();
  await signOut({ redirectTo: "/" });
}

function flatten(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
