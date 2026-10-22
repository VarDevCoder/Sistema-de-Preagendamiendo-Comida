import "dotenv/config";
import { defineConfig } from "prisma/config";

// Las migraciones (CLI) usan la conexión DIRECTA de Neon (sin pooler):
// `prisma migrate` necesita advisory locks y sesiones largas que PgBouncer
// en modo transacción no soporta. La app en runtime usa DATABASE_URL (pooled)
// a través del driver adapter (ver src/lib/db.ts).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
