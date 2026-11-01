/**
 * Free registrations: issued without payment, but through the same inventory
 * validation, unique-credential issuance and audit logging as paid orders.
 * Runs against the real local Supabase stack, calling the same functions the
 * checkout server action uses (create_pending_order -> fulfilOrder "free").
 */
import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { fulfilOrder } from "@/server/payments/fulfillment";

process.loadEnvFile(".env.local");
let db: SupabaseClient;
let eventId: string;
let freeTier: string;
let paidTier: string;
const KEY = () => process.env.TICKET_CREDENTIAL_KEY!;

async function order(tier: string, qty: number) {
  return db.rpc("create_pending_order", { p_payload: {
    event_id: eventId, idempotency_key: `free_${randomBytes(12).toString("hex")}`, public_token_hash: randomBytes(32).toString("hex"), hold_minutes: 35,
    purchaser: { name: "Free Buyer", email: "free@example.test" }, items: [{ ticket_type_id: tier, quantity: qty }],
    attendees: Array.from({ length: qty }, (_, i) => ({ ticket_type_id: tier, full_name: `Free Guest ${i + 1}`, email: `free${i}@example.test`, answers: {} })),
  } });
}

beforeAll(async () => {
  db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  const starts = new Date(Date.now() + 30 * 86400_000).toISOString();
  const { data: ev, error } = await db.from("events").insert({
    slug: `int-free-${randomBytes(4).toString("hex")}`, title: "SAMPLE Free Event", short_description: "SAMPLE",
    starts_at: starts, ends_at: new Date(Date.parse(starts) + 7200_000).toISOString(), timezone: "America/Chicago",
    venue_name: "Sample", registration_mode: "tickets",
  }).select("id").single();
  if (error) throw error;
  eventId = ev.id;
  const { data: t, error: tErr } = await db.from("ticket_types").insert([
    { event_id: eventId, name: "Free RSVP", price_cents: 0, admits_per_unit: 1, capacity: 3, sort_order: 0 },
    { event_id: eventId, name: "Paid", price_cents: 1000, admits_per_unit: 1, capacity: 10, sort_order: 1 },
  ]).select("id, name");
  if (tErr) throw tErr;
  freeTier = t!.find((x) => x.name === "Free RSVP")!.id;
  paidTier = t!.find((x) => x.name === "Paid")!.id;
  await db.from("events").update({ status: "published" }).eq("id", eventId);
});

describe("free tickets", () => {
  it("are issued without payment, with unique credentials and an audit entry", async () => {
    const { data, error } = await order(freeTier, 2);
    expect(error).toBeNull();
    const o = data as { order_id: string; total_cents: number };
    expect(o.total_cents).toBe(0);
    const r = await fulfilOrder(db, o.order_id, { provider: "free" }, KEY());
    expect(r.outcome).toBe("fulfilled");
    const { data: ord } = await db.from("orders").select("status, payment_provider, stripe_checkout_session_id").eq("id", o.order_id).single();
    expect(ord).toEqual({ status: "paid", payment_provider: "free", stripe_checkout_session_id: null });
    const { data: tk } = await db.from("tickets").select("credential_hash, credential_ciphertext, manual_code").eq("order_id", o.order_id);
    expect(tk).toHaveLength(2);
    expect(new Set(tk!.map((t) => t.credential_hash)).size).toBe(2);
    expect(new Set(tk!.map((t) => t.manual_code)).size).toBe(2);
    expect(tk!.every((t) => /^v1\./.test(t.credential_ciphertext))).toBe(true);
    const { data: audit } = await db.from("audit_log").select("action, metadata").eq("entity_id", o.order_id).eq("action", "order.paid");
    expect(audit).toEqual([{ action: "order.paid", metadata: { provider: "free", tickets: 2 } }]);
    const { data: holds } = await db.from("inventory_holds").select("status").eq("order_id", o.order_id);
    expect(holds!.every((h) => h.status === "converted")).toBe(true);
  });

  it("are subject to the same inventory limits (capacity 3: 2 issued, 2 more refused, 1 more allowed)", async () => {
    const tooMany = await order(freeTier, 2);
    expect(tooMany.error?.message).toBe("sold_out");
    const last = await order(freeTier, 1);
    expect(last.error).toBeNull();
    await fulfilOrder(db, (last.data as { order_id: string }).order_id, { provider: "free" }, KEY());
    const { data } = await db.from("ticket_types").select("quantity_sold, capacity").eq("id", freeTier).single();
    expect(data).toEqual({ quantity_sold: 3, capacity: 3 });
    expect((await order(freeTier, 1)).error?.message).toBe("sold_out");
  });

  it("the 'free' path can never be used to skip payment on a paid ticket", async () => {
    const { data } = await order(paidTier, 1);
    await expect(fulfilOrder(db, (data as { order_id: string }).order_id, { provider: "free" }, KEY())).rejects.toThrow(/payment_mismatch/);
    const { count } = await db.from("tickets").select("id", { count: "exact", head: true }).eq("order_id", (data as { order_id: string }).order_id);
    expect(count).toBe(0);
  });
});

describe("fees and tax stay disabled", () => {
  it("orders record no fee or discount: total = sum of ticket prices", async () => {
    const { data } = await order(paidTier, 1);
    const o = await db.from("orders").select("subtotal_cents, fee_cents, discount_cents, total_cents").eq("id", (data as { order_id: string }).order_id).single();
    expect(o.data).toEqual({ subtotal_cents: 1000, fee_cents: 0, discount_cents: 0, total_cents: 1000 });
  });
});
