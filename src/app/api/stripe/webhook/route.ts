import { connection } from "next/server";
import Stripe from "stripe";
import { envSubset } from "@/server/env";
import { handleStripeEvent, LiveModeRefused } from "@/server/payments/webhook";
import { stripeClient, webhookSecret } from "@/server/payments/stripe";
import { serviceDb } from "@/server/supabase";
import { sendQueuedEmailsSoon } from "@/server/email/outbox";

/**
 * Stripe webhook endpoint — the ONLY place payment is confirmed and tickets
 * are issued. Rejects anything whose signature doesn't verify with
 * STRIPE_WEBHOOK_SECRET (raw body, 5-minute tolerance).
 */
export async function POST(req: Request) {
  await connection();
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });
  const body = await req.text();
  if (body.length > 512 * 1024) return new Response("Payload too large", { status: 413 });

  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(body, signature, webhookSecret());
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    const result = await handleStripeEvent(event, {
      db: serviceDb(),
      stripe: stripeClient(),
      credentialKey: envSubset(["TICKET_CREDENTIAL_KEY"]).TICKET_CREDENTIAL_KEY,
      allowLive: process.env.STRIPE_ALLOW_LIVE === "true",
    });
    // Confirmation + ticket emails were queued by fulfilment; send them after replying to Stripe.
    sendQueuedEmailsSoon();
    return Response.json({ received: true, ...result });
  } catch (e) {
    if (e instanceof LiveModeRefused) return new Response("Live mode disabled", { status: 400 });
    console.error(`[stripe-webhook] ${event.type} ${event.id} failed:`, (e as Error).message);
    // Non-2xx => Stripe retries with backoff (up to 3 days). Processing is idempotent.
    return new Response("Processing error", { status: 500 });
  }
}
