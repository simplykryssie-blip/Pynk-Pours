import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against a production build (`next start`) backed by the
 * LOCAL Supabase stack (`npx supabase start`) seeded with SAMPLE data
 * (`npx tsx scripts/db/seed-local-sample.ts`). Never points at hosted services.
 */
const PORT = Number(process.env.E2E_PORT ?? 3123);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 375, height: 812 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: [
    {
      command: `npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      // A second copy of the site with online payments OFF, like production before
      // Stripe is approved: free registration must still work (tests/e2e/free-events.spec.ts).
      command: `npx next start -p ${PORT + 1}`,
      url: `http://localhost:${PORT + 1}`,
      env: { CHECKOUT_ENABLED: "false" },
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      // LOCAL STRIPE TEST DOUBLE (not Stripe) — see tests/support/stripe-double.mts
      command: "npx tsx --env-file=.env.local tests/support/stripe-double.mts",
      url: "http://127.0.0.1:12111/__test/health",
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      // LOCAL RESEND TEST DOUBLE (not Resend; sends nothing) — see tests/support/resend-double.mts
      command: "npx tsx tests/support/resend-double.mts",
      url: "http://127.0.0.1:12113/__test/health",
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
