import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";
import { decideAccess } from "./modules/auth/access";

// Chequeo OPTIMISTA por rol (solo lee el JWT, sin base de datos).
// La autorización definitiva se repite en la capa de datos (requireUser).
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const decision = decideAccess(req.nextUrl.pathname, req.auth?.user?.role ?? null);
  if (!decision.allow) return NextResponse.redirect(new URL(decision.redirectTo, req.nextUrl));
});

export const config = {
  matcher: ["/admin/:path*", "/panel/:path*", "/cuenta/:path*"],
};
