import "server-only";
import { z } from "zod";

/**
 * Server-side environment. Parsed lazily so `next build` works without
 * secrets; any route that needs a value fails loudly if it is missing.
 * Never import this from a Client Component ("server-only" enforces that).
 */
const serverSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  SUPABASE_SECRET_KEY: z.string().min(20),
  STRIPE_SECRET_KEY: z.string().regex(/^sk_(test|live)_/),
  STRIPE_WEBHOOK_SECRET: z.string().regex(/^whsec_/),
  // Live keys are refused unless the owner has explicitly approved go-live.
  STRIPE_ALLOW_LIVE: z.enum(["true", "false"]).default("false"),
  RESEND_API_KEY: z.string().min(10),
  EMAIL_FROM: z.string().min(3),
  EMAIL_REPLY_TO: z.email().optional(),
  CONTACT_INBOX_EMAIL: z.email(),
  TICKET_CREDENTIAL_KEY: z.string().refine(
    (v) => Buffer.from(v, "base64").length === 32,
    "must be 32 random bytes, base64-encoded",
  ),
  RATE_LIMIT_SALT: z.string().min(32),
  CRON_SECRET: z.string().min(32),
  TURNSTILE_SECRET_KEY: z.string().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | undefined;

export function serverEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  if (cached && source === process.env) return cached;
  const parsed = serverSchema.safeParse(source);
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid or missing server environment variables: ${names}`);
  }
  const env = parsed.data;
  if (env.STRIPE_SECRET_KEY.startsWith("sk_live_") && env.STRIPE_ALLOW_LIVE !== "true") {
    throw new Error("Live Stripe key configured without STRIPE_ALLOW_LIVE=true (owner approval required)");
  }
  if (source === process.env) cached = env;
  return env;
}
