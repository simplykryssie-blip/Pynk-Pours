/**
 * Order lifecycle, hold expiry, refunds, check-in outcomes, credential
 * rotation, email outbox, rate limiting, exports and audit logging.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  as, createEvent, createOrder, createStaff, createTestDb, expectError, payOrder, sha256,
  type TestDb,
} from "./helpers";

let db: TestDb;
let owner: string, admin: string, checkin: string;

beforeAll(async () => {
  db = await createTestDb("lifecycle");
  owner = await createStaff(db, "owner");
  admin = await createStaff(db, "admin");
  checkin = await createStaff(db, "checkin");
});
afterAll(async () => db?.close());

const svc = <T>(sql: string, params: unknown[] = []) =>
  as(db, "service_role", null, async (c) => (await c.query(sql, params)).rows[0] as T);
const scan = (user: string, eventId: string, hash: string) =>
  as(db, "authenticated", user, async (c) =>
    (await c.query("select public.check_in_by_credential($1, $2) as r", [eventId, hash])).rows[0].r);
const expireHolds = (orderId: string) =>
  db.pool.query(
    "update public.inventory_holds set expires_at = now() - interval '5 minute' where order_id = $1; ",
    [orderId]).then(() =>
  db.pool.query("update public.orders set expires_at = now() - interval '5 minute' where id = $1", [orderId]));
const tierRemaining = async (eventId: string) => {
  await db.pool.query("update public.events set show_remaining_count = true where id = $1", [eventId]);
  return as(db, "anon", null, async (c) =>
    (await c.query("select remaining, display_state from public.get_event_ticket_options($1)", [eventId])).rows[0]);
};

describe("ticket-hold expiration", () => {
  it("expired holds stop counting immediately, before any sweep runs", async () => {
    const { eventId, tierIds } = await createEvent(db, { tiers: [{ capacity: 2 }] });
    const o = await createOrder(db, { eventId, items: [{ ticket_type_id: tierIds[0], quantity: 2 }] });
    expect((await tierRemaining(eventId)).display_state).toBe("sold_out");
    await expireHolds(o.order_id);
    expect(await tierRemaining(eventId)).toMatchObject({ display_state: "on_sale", remaining: 2 });
    const again = await createOrder(db, { eventId, items: [{ ticket_type_id: tierIds[0], quantity: 2 }] });
    expect(again.order_id).toBeTruthy();
  });

  it("sweep cancels abandoned orders and marks holds expired", async () => {
    const { eventId, tierIds } = await createEvent(db);
    const o = await createOrder(db, { eventId, items: [{ ticket_type_id: tierIds[0], quantity: 1 }] });
    await expireHolds(o.order_id);
    const r = await svc<{ r: { orders_cancelled: number } }>("select public.sweep_expired() as r");
    expect(r.r.orders_cancelled).toBeGreaterThanOrEqual(1);
    const { rows } = await db.pool.query(
      "select o.status, o.status_reason, h.status hold from public.orders o join public.inventory_holds h on h.order_id = o.id where o.id = $1",
      [o.order_id]);
    expect(rows[0]).toMatchObject({ status: "cancelled", status_reason: "checkout_expired", hold: "released" });
  });

  it("checkout.session.expired / payment failure releases holds; repeat is a no-op", async () => {
    const { eventId, tierIds } = await createEvent(db, { tiers: [{ capacity: 1 }] });
    const o = await createOrder(db, { eventId, items: [{ ticket_type_id: tierIds[0], quantity: 1 }] });
    expect((await svc<{ r: string }>("select public.release_order($1, 'failed', 'card_declined') as r", [o.order_id])).r).toBe("released");
    expect((await svc<{ r: string }>("select public.release_order($1, 'cancelled', 'dup') as r", [o.order_id])).r).toBe("noop_failed");
    expect((await tierRemaining(eventId)).display_state).toBe("on_sale");
  });
});

describe("payment verification and fulfilment", () => {
  it("issues one ticket per attendee only after payment; no tickets while pending", async () => {
    const { eventId, tierIds } = await createEvent(db);
    const o = await createOrder(db, { eventId, items: [{ ticket_type_id: tierIds[0], quantity: 2 }] });
    let n = await db.pool.query("select count(*)::int n from public.tickets where order_id = $1", [o.order_id]);
    expect(n.rows[0].n).toBe(0);
    const { result } = await payOrder(db, o.order_id);
    expect(result.outcome).toBe("fulfilled");
    n = await db.pool.query("select count(*)::int n, count(distinct credential_hash)::int h from public.tickets where order_id = $1", [o.order_id]);
    expect(n.rows[0]).toEqual({ n: 2, h: 2 });
  });

  it("amount or currency mismatch: paid + needs_review, no tickets", async () => {
    const { eventId, tierIds } = await createEvent(db);
    const a = await createOrder(db, { eventId, items: [{ ticket_type_id: tierIds[0], quantity: 1 }] });
    const ra = await payOrder(db, a.order_id, { amount_total: 1 });
    expect(ra.result).toMatchObject({ outcome: "needs_review", reason: "amount_mismatch" });
    const b = await createOrder(db, { eventId, items: [{ ticket_type_id: tierIds[0], quantity: 1 }] });
    const rb = await payOrder(db, b.order_id, { currency: "eur" });
    expect(rb.result).toMatchObject({ outcome: "needs_review", reason: "currency_mismatch" });
    const t = await db.pool.query("select count(*)::int n from public.tickets where order_id in ($1, $2)", [a.order_id, b.order_id]);
    expect(t.rows[0].n).toBe(0);
  });

  it("free provider cannot fulfil a paid order", async () => {
    const { eventId, tierIds } = await createEvent(db);
    const o = await createOrder(db, { eventId, items: [{ ticket_type_id: tierIds[0], quantity: 1 }] });
    const err = await expectError(payOrder(db, o.order_id, { provider: "free" }));
    expect(err.message).toMatch(/payment_mismatch/);
  });

  it("free tickets fulfil without Stripe", async () => {
    const { eventId, tierIds } = await createEvent(db, { tiers: [{ price_cents: 0 }] });
    const o = await createOrder(db, { eventId, items: [{ ticket_type_id: tierIds[0], quantity: 1 }] });
    expect(o.total_cents).toBe(0);
    expect((await payOrder(db, o.order_id)).result.outcome).toBe("fulfilled");
  });

  it("late payment after hold expiry is honoured when capacity remains", async () => {
    const { eventId, tierIds } = await createEvent(db, { tiers: [{ capacity: 5 }] });
    const o = await createOrder(db, { eventId, items: [{ ticket_type_id: tierIds[0], quantity: 2 }] });
    await expireHolds(o.order_id);
    await svc("select public.sweep_expired()");
    expect((await payOrder(db, o.order_id)).result.outcome).toBe("fulfilled");
    const { rows } = await db.pool.query("select status, status_reason from public.orders where id = $1", [o.order_id]);
    expect(rows[0]).toEqual({ status: "paid", status_reason: null });
  });

  it("late payment when the seats were resold: needs_review, never oversold", async () => {
    const { eventId, tierIds } = await createEvent(db, { tiers: [{ capacity: 1 }] });
    const late = await createOrder(db, { eventId, items: [{ ticket_type_id: tierIds[0], quantity: 1 }] });
    await expireHolds(late.order_id);
    const other = await createOrder(db, { eventId, items: [{ ticket_type_id: tierIds[0], quantity: 1 }] });
    await payOrder(db, other.order_id);
    const r = await payOrder(db, late.order_id);
    expect(r.result).toMatchObject({ outcome: "needs_review", reason: "capacity_unavailable" });
    const { rows } = await db.pool.query("select quantity_sold from public.ticket_types where id = $1", [tierIds[0]]);
    expect(rows[0].quantity_sold).toBe(1);
  });
});

describe("refunds", () => {
  async function paidOrder(qty = 2, tier: Parameters<typeof createEvent>[1] = {}) {
    const ev = await createEvent(db, tier);
    const o = await createOrder(db, { eventId: ev.eventId, items: [{ ticket_type_id: ev.tierIds[0], quantity: qty }] });
    const { result, creds } = await payOrder(db, o.order_id);
    return { ...ev, orderId: o.order_id, total: o.total_cents, ticketIds: result.ticket_ids!, creds };
  }
  const refund = (orderId: string, amount: number, tickets: string[], release: boolean, refundId: string | null, source = "admin") =>
    svc<{ r: { outcome: string; status: string; needs_review: boolean; released_units: number } }>(
      "select public.record_refund($1, $2, $3::uuid[], $4, $5, $6, $7, 'test') as r",
      [orderId, amount, tickets, release, refundId, source, admin]).then((x) => x.r);

  it("partial refund of one ticket invalidates only that ticket", async () => {
    const p = await paidOrder(2);
    const r = await refund(p.orderId, p.total / 2, [p.ticketIds[0]], true, "re_test_partial_1");
    expect(r).toMatchObject({ outcome: "recorded", status: "partially_refunded", released_units: 1 });
    const res = await scan(checkin, p.eventId, sha256(p.creds[0].raw));
    expect(res.result).toBe("refunded");
    const ok = await scan(checkin, p.eventId, sha256(p.creds[1].raw));
    expect(ok.result).toBe("accepted");
    const { rows } = await db.pool.query("select quantity_sold from public.ticket_types where id = $1", [p.tierIds[0]]);
    expect(rows[0].quantity_sold).toBe(1);
  });

  it("duplicate refund webhook is idempotent", async () => {
    const p = await paidOrder(1);
    await refund(p.orderId, p.total, [], false, "re_test_dup_1", "stripe_dashboard");
    const again = await refund(p.orderId, p.total, [], false, "re_test_dup_1", "stripe_dashboard");
    expect(again.outcome).toBe("already_recorded");
    const { rows } = await db.pool.query("select amount_refunded_cents, status from public.orders where id = $1", [p.orderId]);
    expect(rows[0]).toEqual({ amount_refunded_cents: p.total, status: "refunded" });
  });

  it("full dashboard refund with no ticket list refunds every ticket", async () => {
    const p = await paidOrder(3);
    await refund(p.orderId, p.total, [], false, "re_test_full_dash", "stripe_dashboard");
    const { rows } = await db.pool.query("select distinct status from public.tickets where order_id = $1", [p.orderId]);
    expect(rows).toEqual([{ status: "refunded" }]);
  });

  it("partial dashboard refund with no ticket list is flagged for review", async () => {
    const p = await paidOrder(2);
    const r = await refund(p.orderId, 100, [], false, "re_test_partial_dash", "stripe_dashboard");
    expect(r.needs_review).toBe(true);
    const { rows } = await db.pool.query("select needs_review, review_reason from public.orders where id = $1", [p.orderId]);
    expect(rows[0]).toEqual({ needs_review: true, review_reason: "partial_refund_unmapped" });
  });

  it("cannot refund more than was paid or refund a pending order", async () => {
    const p = await paidOrder(1);
    expect((await expectError(refund(p.orderId, p.total + 1, [], false, null))).message).toMatch(/refund_exceeds_total/);
    const ev = await createEvent(db);
    const pend = await createOrder(db, { eventId: ev.eventId, items: [{ ticket_type_id: ev.tierIds[0], quantity: 1 }] });
    expect((await expectError(refund(pend.order_id, 100, [], false, null))).message).toMatch(/order_not_refundable/);
  });
});

describe("bundle refunds", () => {
  it("releases a table unit only after all its seats are refunded", async () => {
    const ev = await createEvent(db, { tiers: [{ admits_per_unit: 2, price_cents: 10000, capacity: 3 }] });
    const o = await createOrder(db, { eventId: ev.eventId, items: [{ ticket_type_id: ev.tierIds[0], quantity: 1, admits: 2 }] });
    const { result } = await payOrder(db, o.order_id);
    const [t1, t2] = result.ticket_ids!;
    const rr = (amt: number, t: string, id: string) =>
      svc<{ r: { released_units: number } }>(
        "select public.record_refund($1, $2, $3::uuid[], true, $4, 'admin', $5) as r",
        [o.order_id, amt, [t], id, admin]).then((x) => x.r);
    expect((await rr(5000, t1, "re_bundle_1")).released_units).toBe(0);
    expect((await rr(5000, t2, "re_bundle_2")).released_units).toBe(1);
    const { rows } = await db.pool.query(
      "select t.quantity_sold, e.admissions_sold from public.ticket_types t join public.events e on e.id = t.event_id where t.id = $1",
      [ev.tierIds[0]]);
    expect(rows[0]).toEqual({ quantity_sold: 0, admissions_sold: 0 });
  });
});

describe("check-in outcomes", () => {
  it("returns accepted, already_checked_in, invalid, wrong_event, refunded, cancelled", async () => {
    const a = await createEvent(db, { tiers: [{ name: "VIP" }] });
    const b = await createEvent(db);
    const o = await createOrder(db, { eventId: a.eventId, items: [{ ticket_type_id: a.tierIds[0], quantity: 3 }] });
    const { creds, result } = await payOrder(db, o.order_id);
    const [h1, h2, h3] = creds.map((c) => sha256(c.raw));

    const first = await scan(checkin, a.eventId, h1);
    expect(first.result).toBe("accepted");
    expect(first.ticket.ticket_type).toBe("VIP"); // staff see ticket type
    expect(first.ticket.attendee_name).toMatch(/Sample Guest/);
    expect((await scan(checkin, a.eventId, h1)).result).toBe("already_checked_in");
    expect((await scan(checkin, a.eventId, sha256("forged-credential"))).result).toBe("invalid");
    expect((await scan(checkin, a.eventId, "not-a-hash")).result).toBe("invalid");
    expect((await scan(checkin, b.eventId, h2)).result).toBe("wrong_event");

    await svc("select public.record_refund($1, $2, $3::uuid[], false, 're_co_1', 'admin', $4)",
      [o.order_id, 5000, [result.ticket_ids![1]], admin]);
    expect((await scan(checkin, a.eventId, h2)).result).toBe("refunded");

    await as(db, "authenticated", admin, (c) =>
      c.query("select public.admin_cancel_tickets($1::uuid[], false, 'test')", [[result.ticket_ids![2]]]));
    expect((await scan(checkin, a.eventId, h3)).result).toBe("cancelled");

    const { rows } = await db.pool.query(
      "select result, scanned_by, ticket_id from public.check_ins where station_event_id in ($1, $2) order by scanned_at",
      [a.eventId, b.eventId]);
    expect(rows.map((r) => r.result)).toEqual(
      ["accepted", "already_checked_in", "invalid", "invalid", "wrong_event", "refunded", "cancelled"]);
    expect(rows.every((r) => r.scanned_by === checkin)).toBe(true);
    expect(rows[2].ticket_id).toBeNull(); // unknown QR still logged
  });

  it("attendance, recent scans and lookup reflect check-ins", async () => {
    const ev = await createEvent(db);
    const o = await createOrder(db, { eventId: ev.eventId, items: [{ ticket_type_id: ev.tierIds[0], quantity: 2 }] });
    const { creds, result } = await payOrder(db, o.order_id);
    await scan(checkin, ev.eventId, sha256(creds[0].raw));
    const att = await as(db, "authenticated", checkin, async (c) =>
      (await c.query("select public.event_attendance($1) as r", [ev.eventId])).rows[0].r);
    expect(att).toMatchObject({ valid_tickets: 2, checked_in: 1 });
    const recent = await as(db, "authenticated", checkin, async (c) =>
      (await c.query("select * from public.recent_check_ins($1)", [ev.eventId])).rows);
    expect(recent[0]).toMatchObject({ result: "accepted", scanned_by: "Test checkin" });
    const code = (await db.pool.query("select manual_code from public.tickets where id = $1", [result.ticket_ids![1]])).rows[0].manual_code;
    const found = await as(db, "authenticated", checkin, async (c) =>
      (await c.query("select * from public.lookup_tickets($1, $2)", [ev.eventId, code.toLowerCase()])).rows);
    expect(found).toHaveLength(1);
    const manual = await as(db, "authenticated", checkin, async (c) =>
      (await c.query("select public.check_in_by_ticket($1, $2) as r", [ev.eventId, found[0].ticket_id])).rows[0].r);
    expect(manual.result).toBe("accepted");
  });

  it("lookup treats LIKE wildcards literally", async () => {
    const ev = await createEvent(db);
    const o = await createOrder(db, { eventId: ev.eventId, items: [{ ticket_type_id: ev.tierIds[0], quantity: 1 }] });
    await payOrder(db, o.order_id);
    const rows = await as(db, "authenticated", checkin, async (c) =>
      (await c.query("select * from public.lookup_tickets($1, '%%')", [ev.eventId])).rows);
    expect(rows).toHaveLength(0);
  });

  it("admin can undo a mistaken check-in (audited); check-in staff cannot", async () => {
    const ev = await createEvent(db);
    const o = await createOrder(db, { eventId: ev.eventId, items: [{ ticket_type_id: ev.tierIds[0], quantity: 1 }] });
    const { creds, result } = await payOrder(db, o.order_id);
    const h = sha256(creds[0].raw);
    await scan(checkin, ev.eventId, h);
    const err = await expectError(as(db, "authenticated", checkin, (c) =>
      c.query("select public.admin_undo_check_in($1, 'oops')", [result.ticket_ids![0]])));
    expect(err.message).toMatch(/forbidden/);
    await as(db, "authenticated", admin, (c) => c.query("select public.admin_undo_check_in($1, 'oops')", [result.ticket_ids![0]]));
    expect((await scan(checkin, ev.eventId, h)).result).toBe("accepted");
    const audit = await db.pool.query("select actor_user_id from public.audit_log where action = 'ticket.undo_check_in' and entity_id = $1", [result.ticket_ids![0]]);
    expect(audit.rows[0].actor_user_id).toBe(admin);
  });
});

describe("credentials", () => {
  it("only hashes are stored; rotation invalidates the old QR", async () => {
    const ev = await createEvent(db);
    const o = await createOrder(db, { eventId: ev.eventId, items: [{ ticket_type_id: ev.tierIds[0], quantity: 1 }] });
    const { creds, result } = await payOrder(db, o.order_id);
    const stored = await db.pool.query("select * from public.tickets where id = $1", [result.ticket_ids![0]]);
    expect(JSON.stringify(stored.rows[0])).not.toContain(creds[0].raw);
    const newRaw = "rotated-credential-" + Date.now();
    await svc("select public.rotate_ticket_credential($1, $2, 'test-ciphertext-rotated-000', $3, 'sent to wrong person')",
      [result.ticket_ids![0], sha256(newRaw), admin]);
    expect((await scan(checkin, ev.eventId, sha256(creds[0].raw))).result).toBe("invalid");
    expect((await scan(checkin, ev.eventId, sha256(newRaw))).result).toBe("accepted");
  });
});

describe("email outbox", () => {
  it("claims each message once across concurrent workers, retries with backoff", async () => {
    const ev = await createEvent(db);
    const o = await createOrder(db, { eventId: ev.eventId, items: [{ ticket_type_id: ev.tierIds[0], quantity: 2 }] });
    await payOrder(db, o.order_id);
    await db.pool.query("update public.email_messages set next_attempt_at = now() + interval '1 day' where order_id <> $1", [o.order_id]);
    const batches = await Promise.all(Array.from({ length: 4 }, () =>
      as(db, "service_role", null, async (c) => (await c.query("select * from public.claim_due_emails(10)")).rows)));
    const ids = batches.flat().map((m) => m.id);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    await svc("select public.mark_email_result($1, false, null, 'smtp timeout')", [ids[0]]);
    await svc("select public.mark_email_result($1, true, 'msg_123')", [ids[1]]);
    const { rows } = await db.pool.query(
      "select id, status, attempts, next_attempt_at > now() as delayed from public.email_messages where id = any($1)", [ids]);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId[ids[0]]).toMatchObject({ status: "failed", attempts: 1, delayed: true });
    expect(byId[ids[1]]).toMatchObject({ status: "sent" });
  });

  it("admin resend creates a new outbox message and an audit entry", async () => {
    const ev = await createEvent(db);
    const o = await createOrder(db, { eventId: ev.eventId, items: [{ ticket_type_id: ev.tierIds[0], quantity: 1 }] });
    const { result } = await payOrder(db, o.order_id);
    await svc("select public.enqueue_ticket_resend($1, $2)", [result.ticket_ids![0], admin]);
    const { rows } = await db.pool.query("select kind from public.email_messages where ticket_id = $1 order by created_at", [result.ticket_ids![0]]);
    expect(rows.map((r) => r.kind)).toEqual(["ticket", "ticket_resend"]);
    const a = await db.pool.query("select actor_user_id from public.audit_log where action = 'ticket.resend'");
    expect(a.rows.at(-1).actor_user_id).toBe(admin);
  });
});

describe("rate limiting", () => {
  it("allows up to the limit per window then blocks", async () => {
    const key = sha256("203.0.113.9" + "salt");
    const results: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      results.push((await svc<{ ok: boolean }>("select public.check_rate_limit('contact', $1, 5, 600) as ok", [key])).ok);
    }
    expect(results).toEqual([true, true, true, true, true, false]);
    const other = await svc<{ ok: boolean }>("select public.check_rate_limit('contact', $1, 5, 600) as ok", [sha256("other")]);
    expect(other.ok).toBe(true);
  });

  it("is exact under concurrency", async () => {
    const key = sha256("burst");
    const res = await Promise.all(Array.from({ length: 30 }, () =>
      svc<{ ok: boolean }>("select public.check_rate_limit('checkout', $1, 10, 600) as ok", [key])));
    expect(res.filter((r) => r.ok)).toHaveLength(10);
  });
});

describe("exports and audit", () => {
  it("admin exports attendees and sales; each export is audited; checkin cannot export", async () => {
    const ev = await createEvent(db, { tiers: [{ price_cents: 2500 }] });
    const o = await createOrder(db, { eventId: ev.eventId, items: [{ ticket_type_id: ev.tierIds[0], quantity: 2 }] });
    await payOrder(db, o.order_id);
    const attendees = await as(db, "authenticated", admin, async (c) =>
      (await c.query("select * from public.export_attendees($1)", [ev.eventId])).rows);
    expect(attendees).toHaveLength(2);
    expect(attendees[0]).toHaveProperty("manual_code");
    const sales = await as(db, "authenticated", admin, async (c) =>
      (await c.query("select * from public.export_sales($1)", [ev.eventId])).rows);
    expect(sales[0]).toMatchObject({ total_cents: 5000, net_cents: 5000, ticket_count: 2, items: "2 x Sample Tier 1" });
    const summary = await as(db, "authenticated", owner, async (c) =>
      (await c.query("select public.event_sales_summary($1) as r", [ev.eventId])).rows[0].r);
    expect(summary).toMatchObject({ orders_paid: 1, gross_cents: 5000, admissions_sold: 2 });
    const audit = await db.pool.query(
      "select action, actor_user_id from public.audit_log where entity_id = $1 and action like 'export.%' order by id", [ev.eventId]);
    expect(audit.rows).toEqual([
      { action: "export.attendees", actor_user_id: admin },
      { action: "export.sales", actor_user_id: admin },
    ]);
    const err = await expectError(as(db, "authenticated", checkin, (c) => c.query("select * from public.export_attendees($1)", [ev.eventId])));
    expect(err.message).toMatch(/forbidden/);
  });

  it("system actions (payment) are audited with no human actor", async () => {
    const ev = await createEvent(db);
    const o = await createOrder(db, { eventId: ev.eventId, items: [{ ticket_type_id: ev.tierIds[0], quantity: 1 }] });
    await payOrder(db, o.order_id);
    const { rows } = await db.pool.query("select actor_user_id, metadata from public.audit_log where action = 'order.paid' and entity_id = $1", [o.order_id]);
    expect(rows[0].actor_user_id).toBeNull();
    expect(rows[0].metadata).toMatchObject({ provider: "stripe", tickets: 1 });
  });

  it("staff changes are audited with before/after", async () => {
    const u = await createStaff(db, "checkin", "promote-me");
    await as(db, "authenticated", owner, (c) => c.query("select public.owner_set_staff($1, 'admin', true)", [u]));
    const { rows } = await db.pool.query(
      "select actor_user_id, before_data->>'role' b, after_data->>'role' a from public.audit_log where entity_type = 'admin_profiles' and entity_id = $1 and action = 'update'", [u]);
    expect(rows[0]).toEqual({ actor_user_id: owner, b: "checkin", a: "admin" });
  });
});
