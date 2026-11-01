import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // "server-only" throws outside React Server Components; tests run in plain Node.
      "server-only": path.resolve(import.meta.dirname, "tests/support/server-only-stub.ts"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/db/global-setup.ts"],
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
      {
        extends: true,
        test: {
          // Needs the local Supabase stack: `npm run supabase:start`
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          testTimeout: 60_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
