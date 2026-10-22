import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/modules/auth/session";
import { homeForRole, PUBLIC_LOGIN_PATH } from "@/modules/auth/access";

// Destino después de iniciar sesión: el inicio de cada rol.
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  const target = user ? homeForRole(user.role) : PUBLIC_LOGIN_PATH;
  return NextResponse.redirect(new URL(target, request.url));
}
