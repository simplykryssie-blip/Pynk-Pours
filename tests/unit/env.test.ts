import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { serverEnv } from "@/server/env";

const base = {
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_placeholder",
  SUPABASE_SECRET_KEY: "sb_secret_test_placeholder_xxxx",
  STRIPE_SECRET_KEY: "sk_test_placeholder",
  STRIPE_WEBHOOK_SECRET: "whsec_placeholder",
  RESEND_API_KEY: "re_placeholder",
  EMAIL_FROM: "PynkPours <tickets@example.test>",
  CONTACT_INBOX_EMAIL: "inbox@example.test",
  TICKET_CREDENTIAL_KEY: randomBytes(32).toString("base64"),
  RATE_LIMIT_SALT: "s".repeat(32),
  CRON_SECRET: "c".repeat(32),
} as unknown as NodeJS.ProcessEnv;

describe("server env", () => {
  it("accepts a complete test-mode configuration", () => {
    expect(serverEnv({ ...base }).STRIPE_ALLOW_LIVE).toBe("false");
  });
  it("names missing variables without echoing values", () => {
    const rest = { ...base };
    delete rest.SUPABASE_SECRET_KEY;
    expect(() => serverEnv(rest)).toThrow(/SUPABASE_SECRET_KEY/);
  });
  it("refuses live Stripe keys without explicit go-live approval", () => {
    expect(() => serverEnv({ ...base, STRIPE_SECRET_KEY: "sk_live_x" })).toThrow(/owner approval/);
    expect(serverEnv({ ...base, STRIPE_SECRET_KEY: "sk_live_x", STRIPE_ALLOW_LIVE: "true" })).toBeTruthy();
  });
  it("requires a 32-byte credential key", () => {
    expect(() => serverEnv({ ...base, TICKET_CREDENTIAL_KEY: "too-short" })).toThrow(/TICKET_CREDENTIAL_KEY/);
  });
});
