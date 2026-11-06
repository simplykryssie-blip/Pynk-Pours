"use server";

import { redirect } from "next/navigation";
import { CHECKOUT_ERRORS, parseCheckoutForm } from "@/lib/checkout-schema";
import { looksAutomated } from "@/lib/validation";
import { getEventBySlug } from "../data/events";
import { envSubset } from "../env";
import { sendQueuedEmailsSoon } from "../email/outbox";
import { fulfilOrder } from "../payments/fulfillment";
import { checkoutEnabled, stripeClient } from "../payments/stripe";
import { withinRateLimit } from "../request";
import { serviceDb } from "../supabase";
import { isOrderToken, orderTokenFor } from "./tokens";
import { hashCredential } from "../credentials";
import { checkoutSessionParams } from "@/lib/stripe-params";

export interface CheckoutState {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
}

const HOLD_MINUTES = 35;          // seats held while the guest pays
const SESSION_MINUTES = 31;       // Stripe minimum is 30; always shorter than the hold

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export async function startCheckout(_prev: CheckoutState, form: FormData): Promise<CheckoutState> {
  if (looksAutomated(form)) return { status: "error", message: "Please wait a moment and try again." };

  const parsed = parseCheckoutForm(form);
  if (!parsed.ok) return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: parsed.fieldErrors };
  const c = parsed.data;

  if (!(await withinRateLimit("checkout", 10, 600)) || !(await withinRateLimit("checkout-email", 20, 3600, c.purchaser.email))) {
    return { status: "error", message: "Too many checkout attempts. Please wait a few minutes and try again." };
  }

  const event = await getEventBySlug(c.eventSlug);
  if (!event) return { status: "error", message: CHECKOUT_ERRORS.event_unavailable };
  if (!c.ageConfirmed) return { status: "error", message: "Please confirm every guest meets the minimum age.", fieldErrors: { age_confirm: "Required." } };

  const db = serviceDb();
  // Free registrations are always open; paid tickets need online payments switched on.
  const paidOn = checkoutEnabled();
  if (!paidOn) {
    const { data: tiers } = await db.from("ticket_types").select("price_cents").eq("event_id", event.id).in("id", c.items.map((i) => i.ticket_type_id));
    if (!tiers || tiers.length === 0 || tiers.some((t) => t.price_cents > 0)) {
      return { status: "error", message: "Paid tickets aren't on sale online yet." };
    }
  }
  const { token, hash } = orderTokenFor(c.idempotencyKey);
  const { data: order, error } = await db.rpc("create_pending_order", {
    p_payload: {
      event_id: event.id, idempotency_key: c.idempotencyKey, public_token_hash: hash, hold_minutes: HOLD_MINUTES,
      purchaser: c.purchaser, items: c.items, attendees: c.attendees,
    },
  });
  if (error) {
    const friendly = CHECKOUT_ERRORS[error.message];
    if (!friendly) console.error("[checkout] create_pending_order", error.message);
    return { status: "error", message: friendly ?? "We couldn't start your checkout. Please try again." };
  }
  const o = order as { order_id: string; total_cents: number; currency: string; existing: boolean; status: string; line_items: { name: string; unit_price_cents: number; quantity: number }[] };
  const orderUrl = `${siteUrl()}/orders/${token}`;

  // Optional "email me about future events" box: the buyer's own marketing permission.
  if (form.get("marketing_opt_in") === "on") await recordMarketingConsent(c.purchaser.email, "checkout");

  // Double-submit / back-button: never create a second order or charge.
  if (o.existing && o.status !== "pending") redirect(orderUrl);

  // Belt and braces: never start a payment while online payments are off.
  if (!paidOn && o.total_cents > 0) {
    await db.rpc("release_order", { p_order_id: o.order_id, p_status: "cancelled", p_reason: "payments_disabled" });
    return { status: "error", message: "Paid tickets aren't on sale online yet." };
  }

  // Free registration: no payment to verify.
  if (o.total_cents === 0) {
    const { TICKET_CREDENTIAL_KEY } = envSubset(["TICKET_CREDENTIAL_KEY"]);
    await fulfilOrder(db, o.order_id, { provider: "free" }, TICKET_CREDENTIAL_KEY);
    sendQueuedEmailsSoon();
    redirect(orderUrl);
  }

  let sessionUrl: string | null = null;
  // A resubmitted form for an order that already has a Stripe session reuses it.
  if (o.existing) {
    const { data: prior } = await db.from("orders").select("stripe_checkout_session_id").eq("id", o.order_id).single();
    if (prior?.stripe_checkout_session_id) {
      const s = await stripeClient().checkout.sessions.retrieve(prior.stripe_checkout_session_id).catch(() => null);
      redirect(s?.status === "open" && s.url ? s.url : orderUrl);
    }
  }
  try {
    const stripe = stripeClient();
    const session = await stripe.checkout.sessions.create(
      checkoutSessionParams({
        orderId: o.order_id, eventId: event.id, eventTitle: event.title, currency: o.currency,
        purchaserEmail: c.purchaser.email, lines: o.line_items, orderUrl,
        sessionMinutes: SESSION_MINUTES, nowSeconds: Math.floor(Date.now() / 1000),
      }),
      // Same order => same Stripe session (Stripe de-duplicates for 24h).
      { idempotencyKey: `checkout-session:${o.order_id}` },
    );
    sessionUrl = session.url;
    const { error: attachErr } = await db.rpc("attach_checkout_session", { p_order_id: o.order_id, p_session_id: session.id });
    if (attachErr) throw new Error(attachErr.message);
  } catch (e) {
    console.error("[checkout] stripe session failed:", (e as Error).message);
    await db.rpc("release_order", { p_order_id: o.order_id, p_status: "failed", p_reason: "payment_session_error" });
    return { status: "error", message: "Our payment service is temporarily unavailable. Your tickets were not charged — please try again shortly." };
  }
  if (!sessionUrl) return { status: "error", message: "Payment page unavailable. Please try again." };
  redirect(sessionUrl);
}

/**
 * Records that this email agreed to marketing emails. Ticking the box again after
 * unsubscribing is a fresh, explicit opt-in, so it re-subscribes. Never blocks checkout.
 */
async function recordMarketingConsent(email: string, source: string) {
  const { error } = await serviceDb().from("newsletter_subscribers").upsert(
    { email: email.trim().toLowerCase(), source, consented_at: new Date().toISOString(), unsubscribed_at: null },
    { onConflict: "email" },
  );
  if (error) console.error("[checkout] marketing opt-in not recorded:", error.message);
}

/** Guest abandons checkout from their order page: expire the Stripe session and release the seats. */
export async function cancelPendingOrder(_prev: CheckoutState, form: FormData): Promise<CheckoutState> {
  const token = String(form.get("token") ?? "");
  if (!isOrderToken(token)) return { status: "error", message: "Invalid order link." };
  const db = serviceDb();
  const { data: order } = await db.from("orders").select("id, status, stripe_checkout_session_id").eq("public_token_hash", hashCredential(token)).maybeSingle();
  if (!order) return { status: "error", message: "Order not found." };
  if (order.status !== "pending") redirect(`/orders/${token}`);
  if (order.stripe_checkout_session_id) {
    try {
      await stripeClient().checkout.sessions.expire(order.stripe_checkout_session_id);
    } catch (e) {
      // Already completed (paid in another tab) or already expired: re-check before releasing.
      const s = await stripeClient().checkout.sessions.retrieve(order.stripe_checkout_session_id).catch(() => null);
      if (s?.status === "complete") return { status: "error", message: "This order was just paid — refresh to see your tickets." };
      console.warn("[checkout] expire failed:", (e as Error).message);
    }
  }
  await db.rpc("release_order", { p_order_id: order.id, p_status: "cancelled", p_reason: "guest_cancelled" });
  redirect(`/orders/${token}`);
}

/** "Return to payment" for a still-open session. */
export async function resumePayment(form: FormData): Promise<void> {
  const token = String(form.get("token") ?? "");
  if (!isOrderToken(token)) return;
  const { data: order } = await serviceDb().from("orders").select("status, stripe_checkout_session_id").eq("public_token_hash", hashCredential(token)).maybeSingle();
  if (!order || order.status !== "pending" || !order.stripe_checkout_session_id) redirect(`/orders/${token}`);
  const s = await stripeClient().checkout.sessions.retrieve(order.stripe_checkout_session_id).catch(() => null);
  if (s?.status === "open" && s.url) redirect(s.url);
  redirect(`/orders/${token}`);
}
