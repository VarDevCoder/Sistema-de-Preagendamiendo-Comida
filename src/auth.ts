import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import { authConfig } from "./auth.config";
import { loginSchema } from "./modules/auth/schemas";
import { verifyPassword } from "./modules/auth/password";

const providers: Provider[] = [
  Credentials({
    credentials: { email: {}, password: {} },
    async authorize(raw) {
      const parsed = loginSchema.safeParse(raw);
      if (!parsed.success) return null;
      const user = await db.user.findUnique({ where: { email: parsed.data.email } });
      if (!user?.passwordHash || !user.isActive) return null;
      if (!(await verifyPassword(parsed.data.password, user.passwordHash))) return null;
      return { id: user.id, email: user.email, name: user.name, image: user.image, role: user.role };
    },
  }),
];

// Google es opcional: solo se habilita si están las credenciales.
export const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
if (googleEnabled) {
  // Google verifica el email, así que vinculamos con una cuenta existente del mismo email.
  providers.push(Google({ allowDangerousEmailAccountLinking: true }));
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // El adapter tipa contra @prisma/client; nuestro cliente se genera en src/generated.
  adapter: PrismaAdapter(db as unknown as Parameters<typeof PrismaAdapter>[0]),
  providers,
  logger: {
    // Una contraseña incorrecta no es un error del sistema: no ensuciar los logs.
    error(error) {
      if ("type" in error && error.type === "CredentialsSignin") return;
      console.error(error);
    },
  },
  events: {
    // Usuarios que entran por primera vez con Google: crear su perfil de cliente.
    async createUser({ user }) {
      if (user.id) await db.customerProfile.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });
    },
  },
});
