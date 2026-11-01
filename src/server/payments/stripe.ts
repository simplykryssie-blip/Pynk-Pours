import "server-only";
import Stripe from "stripe";

/**
 * Stripe client — TEST MODE ONLY until the owner approves go-live.
 * Live keys are refused unless STRIPE_ALLOW_LIVE=true (not set anywhere).
 *
 * STRIPE_API_BASE lets automated tests point the SDK at a local test double.
 * It is honoured only for localhost URLs and never in production.
 */
export function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  if (key.startsWith("sk_live_") && process.env.STRIPE_ALLOW_LIVE !== "true") {
    throw new Error("Live Stripe keys are disabled (owner approval required)");
  }
  if (!key.startsWith("sk_test_") && !key.startsWith("sk_live_") && !key.startsWith("rk_test_")) {
    throw new Error("STRIPE_SECRET_KEY must be a Stripe secret key");
  }
  const base = process.env.STRIPE_API_BASE;
  let override: Partial<Stripe.StripeConfig> = {};
  if (base) {
    const u = new URL(base);
    if (process.env.NODE_ENV === "production" && process.env.PYNKPOURS_LOCAL_TEST !== "true") {
      throw new Error("STRIPE_API_BASE is for local testing only");
    }
    if (!["127.0.0.1", "localhost"].includes(u.hostname)) throw new Error("STRIPE_API_BASE must be localhost");
    override = { host: u.hostname, port: Number(u.port), protocol: u.protocol.replace(":", "") as "http" | "https" };
  }
  return new Stripe(key, { maxNetworkRetries: 2, timeout: 20_000, appInfo: { name: "PynkPours" }, ...override });
}

export function webhookSecret(): string {
  const s = process.env.STRIPE_WEBHOOK_SECRET;
  if (!s || !s.startsWith("whsec_")) throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  return s;
}

/** Online checkout is switched on explicitly and only when Stripe is configured. */
export function checkoutEnabled(): boolean {
  return process.env.CHECKOUT_ENABLED === "true" && Boolean(process.env.STRIPE_SECRET_KEY);
}
