import type { NextAuthConfig } from "next-auth";

// Configuración sin acceso a la base de datos: la comparte el proxy
// (que solo decodifica el JWT) y la configuración completa de src/auth.ts.
export const authConfig = {
  pages: { signIn: "/ingresar" },
  session: { strategy: "jwt" }, // requerido por el login con email + contraseña
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.role = user.role ?? "CUSTOMER";
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.user.role = token.role ?? "CUSTOMER";
      return session;
    },
  },
} satisfies NextAuthConfig;
