import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests de integración contra Postgres REAL (concurrencia, locks, ledger).
// Necesitan una base de prueba migrada y con seed, cuyo nombre termine en "_test":
//   TEST_DATABASE_URL=postgresql://app:app@localhost:5432/prepago_test npm run test:integration
// Ver docs/fase-4-pedidos.md.
const url = process.env.TEST_DATABASE_URL ?? "postgresql://app:app@localhost:5432/prepago_test";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.int.test.ts"],
    setupFiles: ["./src/test/integration/setup.ts"],
    env: {
      DATABASE_URL: url,
      DATABASE_POOL_MAX: "20",
      PAYMENT_PROVIDER: "mock",
      PAYMENT_WEBHOOK_SECRET: "test-webhook-secret",
      CRON_SECRET: "test-cron-secret",
    },
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
