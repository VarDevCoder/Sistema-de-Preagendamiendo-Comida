import { afterAll } from "vitest";

// Protección: estos tests crean y modifican datos. Solo corren contra bases "*_test".
const url = new URL(process.env.DATABASE_URL ?? "");
const dbName = url.pathname.replace(/^\//, "");
if (!dbName.endsWith("_test")) {
  throw new Error(`Los tests de integración solo corren sobre una base *_test (recibida: "${dbName}").`);
}

afterAll(async () => {
  const { db } = await import("@/lib/db");
  await db.$disconnect();
});
