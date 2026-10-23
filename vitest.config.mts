import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // "server-only" lanza error fuera de React Server Components; en tests es un no-op.
      "server-only": fileURLToPath(new URL("./src/test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Los de integración (*.int.test.ts) necesitan Postgres: `npm run test:integration`.
    exclude: ["src/**/*.int.test.ts", "node_modules/**"],
  },
});
