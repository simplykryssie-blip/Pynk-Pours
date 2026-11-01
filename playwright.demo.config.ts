import { defineConfig } from "@playwright/test";

/** Recorded, captioned walkthrough of the admin dashboard (local stack, SAMPLE/DEMO data). */
export default defineConfig({
  testDir: "tests/demo",
  timeout: 300_000,
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results/demo",
  use: {
    baseURL: "http://localhost:3123",
    viewport: { width: 1280, height: 800 },
    video: { mode: "on", size: { width: 1280, height: 800 } },
    launchOptions: { slowMo: 120 },
  },
  webServer: [
    { command: "npx next start -p 3123", url: "http://localhost:3123", reuseExistingServer: true, timeout: 60_000 },
    { command: "npx tsx --env-file=.env.local tests/support/stripe-double.mts", url: "http://127.0.0.1:12111/__test/health", reuseExistingServer: true, timeout: 30_000 },
  ],
});
