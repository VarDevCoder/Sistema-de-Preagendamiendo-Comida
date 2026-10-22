import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// En Vercel cada instancia serverless abre su propio pool: lo mantenemos chico
// y apuntamos a la URL *pooled* de Neon (host con "-pooler"), que multiplexa
// las conexiones con PgBouncer en modo transacción. Las transacciones
// interactivas (SELECT ... FOR UPDATE) funcionan en ese modo porque toda la
// transacción usa la misma conexión del servidor.
function createClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

// Reutiliza el cliente entre recargas en desarrollo (HMR) para no agotar conexiones.
const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
