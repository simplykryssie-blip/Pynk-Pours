/**
 * Webhook processing against the REAL local Supabase stack (official images).
 * Events are shaped exactly like Stripe's; the Stripe API client is a small
 * in-memory fake (only refunds.list is used by the handler).
 * Signature verification is covered separately (route + e2e).
 */
import { randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { beforeAll, describe, expect, it } from "vitest";
import { handleStripeEvent, LiveModeRefused } from "@/server/payments/webhook";

process.loadEnvFile(".env.local");
let db: SupabaseClient;
let eventId: string;
let tiers: { ga: string; table: string };
const fakeRefunds: Stripe.Refund[] = [];
const deps = () => ({
  db,
  stripe: { refunds: { list: async ({ payment_intent }: { payment_intent: string }) => ({ data: fakeRefunds.filter((r) => r.payment_intent === payment_intent) }) } } as unknown as Pick<Stripe, "refunds">,
  credentialKey: process.env.TICKET_CREDENTIAL_KEY!,
  allowLive: false,
});

const evt = (type: string, object: Record<string, unknown>, extra: Partial<Stripe.Event> = {}) =>
  ({ id: `evt_${randomBytes(10).toString("hex")}`, object: "event", type, livemode: false, created: Date.now() / 1000, data: { object }, ...extra }) as unknown as Stripe.Event;

const session = (orderId: string, total: number, extra: Record<string, unknown> = {}) => ({
  id: `cs_test_${randomBytes(8).toString("hex")}`, object: "checkout.session", mode: "payment", status: "complete",
  payment_status: "paid", amount_total: total, currency: "usd", metadata: { order_id: orderId }, client_reference_id: orderId,
  payment_intent: `pi_test_${randomBytes(8).toString("hex")}`, ...extra,
});

async function newOrder(items: { tt: string; qty: number; admits?: number }[]) {
  const attendees = items.flatMap((it) => Array.from({ length: it.qty * (it.admits ?? 1) }, (_, i) => ({ ticket_type_id: it.tt, full_name: `Integration Guest ${i + 1}`, email: `guest${i + 1}@example.test`, answers: {} })));
  const { data, error } = await db.rpc("create_pending_order", { p_payload: {
    event_id: eventId, idempotency_key: `int_${randomBytes(12).toString("hex")}`, public_token_hash: randomBytes(32).toString("hex"), hold_minutes: 35,
    purchaser: { name: "Integration Buyer", email: "buyer@example.test" }, items: items.map((i) => ({ ticket_type_id: i.tt, quantity: i.qty })), attendees,
  } });
  if (error) throw error;
  const o = data as { order_id: string; total_cents: number };
  return o;
}
const order = async (id: string) => (await db.from("orders").select("status, needs_review, review_reason, amount_refunded_cents, stripe_payment_intent_id").eq("id", id).single()).data!;
const ticketCount = async (id: string) => (await db.from("tickets").select("id", { count: "exact", head: true }).eq("order_id", id)).count;

beforeAll(async () => {
  db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  const slug = `int-pay-${randomBytes(4).toString("hex")}`;
  const starts = new Date(Date.now() + 40 * 86400_000).toISOString();
  const ends = new Date(Date.now() + 40 * 86400_000 + 3 * 3600_000).toISOString();
  const { data: ev, error } = await db.from("events").insert({ slug, title: "SAMPLE Integration Payments Event", short_description: "SAMPLE", starts_at: starts, ends_at: ends, timezone: "America/Chicago", venue_name: "Sample", registration_mode: "tickets", capacity: 40 }).select("id").single();
  if (error) throw error;
  eventId = ev.id;
  const { data: t, error: tErr } = await db.from("ticket_types").insert([
    { event_id: eventId, name: "GA", price_cents: 4500, admits_per_unit: 1, capacity: 30, sort_order: 0 },
    { event_id: eventId, name: "Table for 4", price_cents: 16000, admits_per_unit: 4, capacity: 3, sort_order: 1 },
  ]).select("id, name");
  if (tErr) throw new Error(`ticket_types insert: ${tErr.message}`);
  tiers = { ga: t!.find((x) => x.name === "GA")!.id, table: t!.find((x) => x.name !== "GA")!.id };
  await db.from("events").update({ status: "published" }).eq("id", eventId);
});

describe("checkout.session.completed", () => {
  it("issues one ticket per guest (tables: one per seat) only after a verified paid session", async () => {
    const o = await newOrder([{ tt: tiers.ga, qty: 2 }, { tt: tiers.table, qty: 1, admits: 4 }]);
    expect(o.total_cents).toBe(2 * 4500 + 16000);
    expect(await ticketCount(o.order_id)).toBe(0);
    const r = await handleStripeEvent(evt("checkout.session.completed", session(o.order_id, o.total_cents)), deps());
    expect(r).toEqual({ status: "processed", outcome: "fulfilled" });
    expect((await order(o.order_id)).status).toBe("paid");
    expect(await ticketCount(o.order_id)).toBe(6);
    const { data: tk } = await db.from("tickets").select("credential_hash, credential_ciphertext, manual_code").eq("order_id", o.order_id);
    expect(new Set(tk!.map((t) => t.credential_hash)).size).toBe(6);
    expect(tk!.every((t) => /^v1\./.test(t.credential_ciphertext))).toBe(true);
  });

  it("does nothing for an unpaid session (e.g. delayed payment methods)", async () => {
    const o = await newOrder([{ tt: tiers.ga, qty: 1 }]);
    const r = await handleStripeEvent(evt("checkout.session.completed", session(o.order_id, o.total_cents, { payment_status: "unpaid" })), deps());
    expect(r.outcome).toBe("awaiting_payment");
    expect((await order(o.order_id)).status).toBe("pending");
    expect(await ticketCount(o.order_id)).toBe(0);
  });

  it("flags a tampered amount for review and issues no tickets", async () => {
    const o = await newOrder([{ tt: tiers.ga, qty: 1 }]);
    const r = await handleStripeEvent(evt("checkout.session.completed", session(o.order_id, 100)), deps());
    expect(r.outcome).toBe("needs_review:amount_mismatch");
    expect(await order(o.order_id)).toMatchObject({ status: "paid", needs_review: true, review_reason: "amount_mismatch" });
    expect(await ticketCount(o.order_id)).toBe(0);
  });

  it("ignores events without a valid order reference", async () => {
    const r = await handleStripeEvent(evt("checkout.session.completed", session("not-a-uuid", 100, { metadata: {}, client_reference_id: null })), deps());
    expect(r.outcome).toBe("no_order_reference");
  });
});

describe("idempotency", () => {
  it("a redelivered event is acknowledged without side effects", async () => {
    const o = await newOrder([{ tt: tiers.ga, qty: 3 }]);
    const e = evt("checkout.session.completed", session(o.order_id, o.total_cents));
    await handleStripeEvent(e, deps());
    expect(await handleStripeEvent(e, deps())).toEqual({ status: "duplicate", outcome: "already_processed" });
    expect(await ticketCount(o.order_id)).toBe(3);
    const { count } = await db.from("email_messages").select("id", { count: "exact", head: true }).eq("order_id", o.order_id);
    expect(count).toBe(4); // 1 confirmation + 3 tickets
  });

  it("10 concurrent deliveries of the same event, plus a different event for the same session: tickets issued once", async () => {
    const o = await newOrder([{ tt: tiers.table, qty: 1, admits: 4 }]);
    const s = session(o.order_id, o.total_cents);
    const e = evt("checkout.session.completed", s);
    const other = evt("checkout.session.async_payment_succeeded", s);
    const results = await Promise.allSettled([...Array.from({ length: 10 }, () => handleStripeEvent(e, deps())), handleStripeEvent(other, deps())]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await ticketCount(o.order_id)).toBe(4);
    const { data: sold } = await db.from("ticket_types").select("quantity_sold").eq("id", tiers.table).single();
    const { count: paidTables } = await db.from("order_items").select("id, orders!inner(status)", { count: "exact", head: true }).eq("ticket_type_id", tiers.table).eq("orders.status", "paid");
    expect(sold!.quantity_sold).toBe(paidTables);
  });
});

describe("abandoned / expired / failed", () => {
  it("checkout.session.expired releases the hold and cancels the order", async () => {
    const o = await newOrder([{ tt: tiers.ga, qty: 2 }]);
    const r = await handleStripeEvent(evt("checkout.session.expired", session(o.order_id, o.total_cents, { status: "expired", payment_status: "unpaid" })), deps());
    expect(r.outcome).toBe("released");
    expect((await order(o.order_id)).status).toBe("cancelled");
    const { data: holds } = await db.from("inventory_holds").select("status").eq("order_id", o.order_id);
    expect(holds!.every((h) => h.status === "released")).toBe(true);
  });

  it("async_payment_failed marks the order failed; a declined card alone changes nothing", async () => {
    const o = await newOrder([{ tt: tiers.ga, qty: 1 }]);
    expect((await handleStripeEvent(evt("payment_intent.payment_failed", { id: "pi_x", metadata: { order_id: o.order_id } }), deps())).outcome).toBe("payment_failed_logged");
    expect((await order(o.order_id)).status).toBe("pending");
    await handleStripeEvent(evt("checkout.session.async_payment_failed", session(o.order_id, o.total_cents, { payment_status: "unpaid" })), deps());
    expect((await order(o.order_id)).status).toBe("failed");
  });

  it("a payment that lands after expiry is still honoured if seats remain", async () => {
    const o = await newOrder([{ tt: tiers.ga, qty: 1 }]);
    await handleStripeEvent(evt("checkout.session.expired", session(o.order_id, o.total_cents, { status: "expired" })), deps());
    const r = await handleStripeEvent(evt("checkout.session.completed", session(o.order_id, o.total_cents)), deps());
    expect(r.outcome).toBe("fulfilled");
    expect((await order(o.order_id)).status).toBe("paid");
  });
});

describe("refunds reconciled from Stripe (dashboard refunds)", () => {
  it("full refund: every ticket refunded; check-in then says 'refunded'", async () => {
    const o = await newOrder([{ tt: tiers.ga, qty: 2 }]);
    const s = session(o.order_id, o.total_cents);
    await handleStripeEvent(evt("checkout.session.completed", s), deps());
    fakeRefunds.push({ id: `re_${randomBytes(8).toString("hex")}`, object: "refund", amount: o.total_cents, payment_intent: s.payment_intent, status: "succeeded", metadata: {} } as unknown as Stripe.Refund);
    const charge = evt("charge.refunded", { id: "ch_1", object: "charge", payment_intent: s.payment_intent });
    expect((await handleStripeEvent(charge, deps())).outcome).toBe("refunds_reconciled:1");
    // A second notification about the same refund changes nothing.
    expect((await handleStripeEvent(evt("charge.refund.updated", { id: "re_x", object: "refund", payment_intent: s.payment_intent }), deps())).outcome).toBe("refunds_reconciled:0");
    expect(await order(o.order_id)).toMatchObject({ status: "refunded", amount_refunded_cents: o.total_cents });
    const { data: tk } = await db.from("tickets").select("status").eq("order_id", o.order_id);
    expect(tk!.every((t) => t.status === "refunded")).toBe(true);
  });

  it("partial dashboard refund: flagged for an admin to map to tickets", async () => {
    const o = await newOrder([{ tt: tiers.ga, qty: 2 }]);
    const s = session(o.order_id, o.total_cents);
    await handleStripeEvent(evt("checkout.session.completed", s), deps());
    fakeRefunds.push({ id: `re_${randomBytes(8).toString("hex")}`, object: "refund", amount: 1000, payment_intent: s.payment_intent, status: "succeeded", metadata: {} } as unknown as Stripe.Refund);
    await handleStripeEvent(evt("charge.refunded", { id: "ch_2", payment_intent: s.payment_intent }), deps());
    expect(await order(o.order_id)).toMatchObject({ status: "partially_refunded", needs_review: true, review_reason: "partial_refund_unmapped" });
  });

  it("admin-initiated refund metadata maps to the exact tickets", async () => {
    const o = await newOrder([{ tt: tiers.ga, qty: 2 }]);
    const s = session(o.order_id, o.total_cents);
    await handleStripeEvent(evt("checkout.session.completed", s), deps());
    const { data: tk } = await db.from("tickets").select("id").eq("order_id", o.order_id).order("issued_at");
    const actor = (await db.from("admin_profiles").select("user_id").limit(1).single()).data?.user_id ?? null;
    fakeRefunds.push({ id: `re_${randomBytes(8).toString("hex")}`, object: "refund", amount: 4500, payment_intent: s.payment_intent, status: "succeeded",
      metadata: { ticket_ids: tk![0].id, initiated_by: actor ?? "", release_inventory: "true" } } as unknown as Stripe.Refund);
    await handleStripeEvent(evt("charge.refunded", { id: "ch_3", payment_intent: s.payment_intent }), deps());
    const { data: after } = await db.from("tickets").select("id, status").eq("order_id", o.order_id);
    expect(after!.find((t) => t.id === tk![0].id)!.status).toBe("refunded");
    expect(after!.filter((t) => t.status === "valid")).toHaveLength(1);
  });
});

describe("safety", () => {
  it("refuses live-mode events while live payments are disabled", async () => {
    await expect(handleStripeEvent(evt("checkout.session.completed", session(randomUUID(), 100), { livemode: true }), deps())).rejects.toBeInstanceOf(LiveModeRefused);
  });

  it("ignores unrelated event types", async () => {
    expect((await handleStripeEvent(evt("customer.created", { id: "cus_1" }), deps())).status).toBe("ignored");
  });
});
