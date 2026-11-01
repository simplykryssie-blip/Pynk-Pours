import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { fulfilOrder } from "./fulfillment";

export interface WebhookDeps {
  db: SupabaseClient; // service (secret-key) client
  stripe: Pick<Stripe, "refunds">;
  credentialKey: string;
  allowLive: boolean;
}

export interface WebhookResult { status: "processed" | "duplicate" | "ignored"; outcome: string }

export class LiveModeRefused extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : v?.id ?? null);

function orderIdFromSession(s: Stripe.Checkout.Session): string | null {
  const id = s.metadata?.order_id ?? s.client_reference_id ?? null;
  return id && UUID.test(id) ? id : null;
}

/**
 * Process ONE verified Stripe event. The caller must have verified the
 * signature (stripe.webhooks.constructEvent) before calling this.
 *
 * Idempotency: every event id is recorded in stripe_events. A redelivered,
 * already-processed event is acknowledged without doing anything. All
 * state changes (fulfil/release/refund) are themselves idempotent in the
 * database, so even concurrent duplicate deliveries cannot double-issue.
 */
export async function handleStripeEvent(event: Stripe.Event, deps: WebhookDeps): Promise<WebhookResult> {
  if (event.livemode && !deps.allowLive) throw new LiveModeRefused("Live-mode event received while live payments are disabled");

  const { data: inserted, error: insErr } = await deps.db
    .from("stripe_events")
    .upsert({ id: event.id, type: event.type, livemode: event.livemode }, { onConflict: "id", ignoreDuplicates: true })
    .select("id");
  if (insErr) throw new Error(`stripe_events insert failed: ${insErr.message}`);
  if (!inserted || inserted.length === 0) {
    const { data: prior } = await deps.db.from("stripe_events").select("processed_at").eq("id", event.id).single();
    if (prior?.processed_at) return { status: "duplicate", outcome: "already_processed" };
    // Previously received but not finished (crash/timeout): safe to process again.
  }

  try {
    const outcome = await dispatch(event, deps);
    await deps.db.from("stripe_events").update({ processed_at: new Date().toISOString(), outcome, error: null }).eq("id", event.id);
    return { status: outcome === "ignored" ? "ignored" : "processed", outcome };
  } catch (e) {
    await deps.db.from("stripe_events").update({ error: String((e as Error).message).slice(0, 1000) }).eq("id", event.id);
    throw e;
  }
}

async function dispatch(event: Stripe.Event, deps: WebhookDeps): Promise<string> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object as Stripe.Checkout.Session;
      const orderId = orderIdFromSession(s);
      if (!orderId) return "no_order_reference";
      if (s.mode !== "payment") return "ignored_mode";
      if (s.payment_status !== "paid") return "awaiting_payment"; // e.g. delayed methods; fulfilled on async_payment_succeeded
      const r = await fulfilOrder(deps.db, orderId, {
        provider: "stripe",
        checkout_session_id: s.id,
        payment_intent_id: idOf(s.payment_intent as string | Stripe.PaymentIntent | null),
        amount_total: s.amount_total,
        currency: s.currency,
      }, deps.credentialKey);
      return r.outcome === "needs_review" ? `needs_review:${r.reason}` : r.outcome;
    }
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      const s = event.data.object as Stripe.Checkout.Session;
      const orderId = orderIdFromSession(s);
      if (!orderId) return "no_order_reference";
      const failed = event.type === "checkout.session.async_payment_failed";
      const { data, error } = await deps.db.rpc("release_order", {
        p_order_id: orderId, p_status: failed ? "failed" : "cancelled", p_reason: failed ? "async_payment_failed" : "checkout_expired",
      });
      if (error) throw new Error(`release_order failed: ${error.message}`);
      return String(data);
    }
    case "charge.refunded":
    case "charge.refund.updated": {
      const obj = event.data.object as Stripe.Charge | Stripe.Refund;
      const pi = idOf((obj as { payment_intent?: string | { id: string } | null }).payment_intent);
      return pi ? reconcileRefunds(pi, deps) : "no_payment_intent";
    }
    case "payment_intent.payment_failed":
      // A declined card inside Checkout: the guest can retry; the order stays
      // pending (holds intact) until success or session expiry.
      return "payment_failed_logged";
    default:
      return "ignored";
  }
}

/**
 * Bring the order's refund state in line with Stripe. Refunds created from the
 * PynkPours admin are already recorded (same refund id → no-op). Refunds made
 * in the Stripe dashboard are recorded here: full refunds invalidate all
 * tickets; partial ones flag the order for an admin to choose which tickets.
 */
async function reconcileRefunds(paymentIntentId: string, deps: WebhookDeps): Promise<string> {
  const { data: order } = await deps.db.from("orders").select("id").eq("stripe_payment_intent_id", paymentIntentId).maybeSingle();
  if (!order) return "order_not_found";
  const refunds = await deps.stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100 });
  let recorded = 0;
  for (const r of refunds.data) {
    if (r.status !== "succeeded" || !r.amount) continue;
    const ticketIds = (r.metadata?.ticket_ids ?? "").split(",").filter((x) => UUID.test(x));
    const actor = r.metadata?.initiated_by && UUID.test(r.metadata.initiated_by) ? r.metadata.initiated_by : null;
    const { data, error } = await deps.db.rpc("record_refund", {
      p_order_id: order.id, p_amount_cents: r.amount, p_ticket_ids: ticketIds,
      p_release_inventory: r.metadata?.release_inventory === "true", p_stripe_refund_id: r.id,
      p_source: actor ? "admin" : "stripe_dashboard", p_actor: actor, p_reason: r.metadata?.reason ?? r.reason ?? null,
    });
    if (error) throw new Error(`record_refund failed: ${error.message}`);
    if ((data as { outcome: string }).outcome === "recorded") recorded++;
  }
  return `refunds_reconciled:${recorded}`;
}
