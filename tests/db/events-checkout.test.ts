/**
 * Event publishing guards, flexible ticket configuration, and server-side
 * checkout validation (ACCEPTANCE_TESTS.md › Ticket configuration, Guest checkout).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  as, createEvent, createOrder, createStaff, createTestDb, expectError, orderPayload,
  type TestDb,
} from "./helpers";

let db: TestDb;
let admin: string;

beforeAll(async () => {
  db = await createTestDb("events");
  admin = await createStaff(db, "admin");
});
afterAll(async () => db?.close());

const opts = (eventId: string) =>
  as(db, "anon", null, async (c) =>
    (await c.query("select * from public.get_event_ticket_options($1)", [eventId])).rows);

describe("event publishing (admin via RLS)", () => {
  it("admin creates a draft; incomplete events cannot be published", async () => {
    const id = await as(db, "authenticated", admin, async (c) =>
      (await c.query("insert into public.events (slug, title) values ('draft-only', 'Draft') returning id")).rows[0].id);
    const err = await expectError(as(db, "authenticated", admin, (c) =>
      c.query("update public.events set status = 'published' where id = $1", [id])));
    expect(err.message).toMatch(/cannot be published/);
  });

  it("rejects events created directly as published", async () => {
    const err = await expectError(as(db, "authenticated", admin, (c) =>
      c.query("insert into public.events (slug, title, status) values ('sneaky', 'X', 'published')")));
    expect(err.message).toMatch(/permission denied/); // status not in the INSERT column grant
  });

  it("validates timezone, slug and time order", async () => {
    const tz = await expectError(as(db, "authenticated", admin, (c) =>
      c.query("insert into public.events (slug, title, timezone) values ('tz-bad', 'X', 'Mars/Olympus')")));
    expect(tz.message).toMatch(/Invalid IANA timezone/);
    const slug = await expectError(as(db, "authenticated", admin, (c) =>
      c.query("insert into public.events (slug, title) values ('Bad Slug!', 'X')")));
    expect(slug.message).toMatch(/check constraint/);
    const order = await expectError(as(db, "authenticated", admin, (c) =>
      c.query(`insert into public.events (slug, title, starts_at, ends_at)
               values ('time-bad', 'X', now() + interval '2 day', now() + interval '1 day')`)));
    expect(order.message).toMatch(/events_time_order/);
  });

  it("ticket-mode events need at least one ticket type to publish", async () => {
    const id = await as(db, "authenticated", admin, async (c) =>
      (await c.query(`insert into public.events (slug, title, short_description, starts_at, timezone,
                        venue_name, registration_mode)
                      values ('no-tiers', 'X', 'd', now() + interval '10 day', 'America/Chicago',
                        'V', 'tickets') returning id`)).rows[0].id);
    const err = await expectError(as(db, "authenticated", admin, (c) =>
      c.query("update public.events set status = 'published' where id = $1", [id])));
    expect(err.message).toMatch(/at least one ticket type/);
  });

  it("publishing sets published_at and every change is audited", async () => {
    const { eventId } = await createEvent(db, { publish: false });
    await as(db, "authenticated", admin, (c) =>
      c.query("update public.events set status = 'published' where id = $1", [eventId]));
    const { rows } = await db.pool.query("select published_at from public.events where id = $1", [eventId]);
    expect(rows[0].published_at).not.toBeNull();
    const audit = await as(db, "authenticated", admin, async (c) =>
      (await c.query("select * from public.audit_log where entity_id = $1 and action = 'update'", [eventId])).rows);
    expect(audit.length).toBeGreaterThan(0);
    expect(audit.at(-1).actor_user_id).toBe(admin);
    expect(audit.at(-1).actor_role).toBe("admin");
  });
});

describe("flexible ticket configuration", () => {
  it("supports a single fixed-price ticket (no VIP)", async () => {
    const { eventId } = await createEvent(db, { tiers: [{ name: "Admission", price_cents: 4000 }] });
    const o = await opts(eventId);
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ name: "Admission", price_cents: 4000, display_state: "on_sale" });
  });

  it("supports multiple custom tiers in display order", async () => {
    const { eventId } = await createEvent(db, {
      tiers: [{ name: "Early Bird", price_cents: 3000 }, { name: "General", price_cents: 4500 },
              { name: "Table for 4", price_cents: 15000, admits_per_unit: 4 }],
    });
    const o = await opts(eventId);
    expect(o.map((x) => x.name)).toEqual(["Early Bird", "General", "Table for 4"]);
  });

  it("derives display states: scheduled, ended, paused, closed, sold_out, coming_soon", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const { eventId } = await createEvent(db, {
      tiers: [
        { name: "Scheduled", sales_start_at: future },
        { name: "Ended", sales_start_at: new Date(Date.now() - 2 * 86_400_000).toISOString(), sales_end_at: past },
        { name: "Paused", status: "paused" },
        { name: "Closed", status: "closed" },
        { name: "Zero", capacity: 0 },
      ],
    });
    const states = Object.fromEntries((await opts(eventId)).map((x) => [x.name, x.display_state]));
    expect(states).toEqual({ Scheduled: "scheduled", Ended: "ended", Paused: "paused", Closed: "closed", Zero: "sold_out" });

    const cs = await createEvent(db, { registration_mode: "coming_soon" });
    expect((await opts(cs.eventId))[0].display_state).toBe("coming_soon");
  });

  it("does not reveal remaining counts unless the event opts in", async () => {
    const { eventId } = await createEvent(db, { tiers: [{ capacity: 7 }] });
    expect((await opts(eventId))[0].remaining).toBeNull();
    await db.pool.query("update public.events set show_remaining_count = true where id = $1", [eventId]);
    expect((await opts(eventId))[0].remaining).toBe(7);
  });

  it("admits_per_unit is locked once a tier has orders", async () => {
    const { eventId, tierIds } = await createEvent(db);
    await createOrder(db, { eventId, items: [{ ticket_type_id: tierIds[0], quantity: 1 }] });
    const err = await expectError(as(db, "authenticated", admin, (c) =>
      c.query("update public.ticket_types set admits_per_unit = 2 where id = $1", [tierIds[0]])));
    expect(err.message).toMatch(/admits_per_unit cannot change/);
  });
});

describe("checkout validation (server-side)", () => {
  it("creates a pending order with server-computed totals, ignoring client prices", async () => {
    const { eventId, tierIds } = await createEvent(db, {
      tiers: [{ price_cents: 5900 }, { price_cents: 9900 }],
    });
    const o = await createOrder(db, {
      eventId, items: [{ ticket_type_id: tierIds[0], quantity: 2 }, { ticket_type_id: tierIds[1], quantity: 1 }],
    });
    expect(o.total_cents).toBe(2 * 5900 + 9900);
    const { rows } = await db.pool.query(
      "select purchaser_email, status, total_cents from public.orders where id = $1", [o.order_id]);
    expect(rows[0]).toMatchObject({ purchaser_email: "buyer@example.test", status: "pending", total_cents: 21700 });
    const att = await db.pool.query("select email from public.attendees where order_id = $1", [o.order_id]);
    expect(att.rows).toHaveLength(3);
    expect(att.rows.every((r) => r.email === r.email.toLowerCase().trim())).toBe(true);
    const tickets = await db.pool.query("select count(*)::int n from public.tickets where order_id = $1", [o.order_id]);
    expect(tickets.rows[0].n).toBe(0); // no tickets before payment
  });

  it("is idempotent for the same form submission", async () => {
    const { eventId, tierIds } = await createEvent(db);
    const a = await createOrder(db, { eventId, items: [{ ticket_type_id: tierIds[0], quantity: 1 }], idempotencyKey: "idem_same_submit_0001" });
    const b = await createOrder(db, { eventId, items: [{ ticket_type_id: tierIds[0], quantity: 1 }], idempotencyKey: "idem_same_submit_0001" });
    expect(b.order_id).toBe(a.order_id);
    expect(b.existing).toBe(true);
  });

  const reject = async (eventId: string, items: { ticket_type_id: string; quantity: number; admits?: number }[], code: RegExp, mutate?: (p: ReturnType<typeof orderPayload>) => void) => {
    const p = orderPayload({ eventId, items });
    mutate?.(p);
    const err = await expectError(as(db, "service_role", null, (c) =>
      c.query("select public.create_pending_order($1::jsonb)", [JSON.stringify(p)])));
    expect(err.message).toMatch(code);
  };

  it("rejects draft, cancelled, coming-soon and closed events", async () => {
    const d = await createEvent(db, { publish: false });
    await reject(d.eventId, [{ ticket_type_id: d.tierIds[0], quantity: 1 }], /event_unavailable/);
    const c = await createEvent(db);
    await db.pool.query("update public.events set status = 'cancelled' where id = $1", [c.eventId]);
    await reject(c.eventId, [{ ticket_type_id: c.tierIds[0], quantity: 1 }], /event_unavailable/);
    const cs = await createEvent(db, { registration_mode: "coming_soon" });
    await reject(cs.eventId, [{ ticket_type_id: cs.tierIds[0], quantity: 1 }], /registration_not_open/);
    const cl = await createEvent(db, { registration_mode: "closed" });
    await reject(cl.eventId, [{ ticket_type_id: cl.tierIds[0], quantity: 1 }], /registration_not_open/);
  });

  it("enforces sale windows and tier status", async () => {
    const { eventId, tierIds } = await createEvent(db, {
      tiers: [{ sales_start_at: new Date(Date.now() + 86_400_000).toISOString() }, { status: "paused" },
              { status: "closed" }],
    });
    for (const id of tierIds) await reject(eventId, [{ ticket_type_id: id, quantity: 1 }], /ticket_type_not_on_sale/);
  });

  it("stops sales once the event has started", async () => {
    const { eventId, tierIds } = await createEvent(db);
    await db.pool.query(
      "update public.events set starts_at = now() - interval '2 hour', ends_at = now() - interval '1 hour' where id = $1",
      [eventId]);
    await reject(eventId, [{ ticket_type_id: tierIds[0], quantity: 1 }], /ticket_type_not_on_sale/);
  });

  it("enforces per-tier and per-event max per order", async () => {
    const { eventId, tierIds } = await createEvent(db, { tiers: [{ max_per_order: 2 }, {}], max_tickets_per_order: 4 });
    await reject(eventId, [{ ticket_type_id: tierIds[0], quantity: 3 }], /exceeds_max_per_order/);
    await reject(eventId, [{ ticket_type_id: tierIds[1], quantity: 5 }], /exceeds_max_per_order/);
  });

  it("rejects tiers from another event, duplicates, zero quantity", async () => {
    const a = await createEvent(db);
    const b = await createEvent(db);
    await reject(a.eventId, [{ ticket_type_id: b.tierIds[0], quantity: 1 }], /ticket_type_not_found/);
    await reject(a.eventId, [{ ticket_type_id: a.tierIds[0], quantity: 1 }, { ticket_type_id: a.tierIds[0], quantity: 1 }], /invalid_request/);
    await reject(a.eventId, [{ ticket_type_id: a.tierIds[0], quantity: 0 }], /invalid_quantity/);
  });

  it("requires one attendee per admission (bundles admit N)", async () => {
    const { eventId, tierIds } = await createEvent(db, { tiers: [{ admits_per_unit: 4, price_cents: 20000 }] });
    await reject(eventId, [{ ticket_type_id: tierIds[0], quantity: 1, admits: 1 }], /attendee_count_mismatch/);
    const ok = await createOrder(db, { eventId, items: [{ ticket_type_id: tierIds[0], quantity: 1, admits: 4 }] });
    expect(ok.total_cents).toBe(20000);
    const att = await db.pool.query("select count(*)::int n from public.attendees where order_id = $1", [ok.order_id]);
    expect(att.rows[0].n).toBe(4);
  });

  it("enforces required event questions and rejects unknown answer keys", async () => {
    const { eventId, tierIds } = await createEvent(db);
    const q = await db.pool.query(
      "insert into public.event_questions (event_id, label, is_required) values ($1, 'How did you hear about us?', true) returning id",
      [eventId]);
    const qid = q.rows[0].id;
    await reject(eventId, [{ ticket_type_id: tierIds[0], quantity: 1 }], /missing_required_answer/);
    await reject(eventId, [{ ticket_type_id: tierIds[0], quantity: 1 }], /invalid_answers/, (p) => {
      p.attendees[0].answers = { [qid]: "Friend", "not-a-question": "x" };
    });
    const ok = await createOrder(db, { eventId, items: [{ ticket_type_id: tierIds[0], quantity: 1 }], answers: { [qid]: "Friend" } });
    expect(ok.order_id).toBeTruthy();
  });

  it("rejects malformed purchaser emails via constraints", async () => {
    const { eventId, tierIds } = await createEvent(db);
    await reject(eventId, [{ ticket_type_id: tierIds[0], quantity: 1 }], /check constraint/, (p) => {
      p.purchaser.email = "not-an-email";
    });
  });
});
