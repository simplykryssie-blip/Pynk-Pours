/**
 * Stage C: MFA-enforced staff access, archive, registration deadline, media,
 * duplicate/reorder/attendee-edit RPCs, dashboard + per-tier statistics.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  as, createEvent, createOrder, createStaff, createTestDb, expectError, payOrder, type TestDb,
} from "./helpers";

let db: TestDb;
let owner: string, admin: string, checkin: string;

beforeAll(async () => {
  db = await createTestDb("admin");
  owner = await createStaff(db, "owner");
  admin = await createStaff(db, "admin");
  checkin = await createStaff(db, "checkin");
});
afterAll(async () => db?.close());

const opts = (eventId: string, user: string | null = null) =>
  as(db, user ? "authenticated" : "anon", user, async (c) =>
    (await c.query("select * from public.get_event_ticket_options($1)", [eventId])).rows);

describe("MFA is enforced in the database", () => {
  it("a password-only (aal1) session gets no staff access", async () => {
    const { eventId } = await createEvent(db);
    const o = await createOrder(db, { eventId, items: [{ ticket_type_id: (await opts(eventId))[0].id, quantity: 1 }] });
    await payOrder(db, o.order_id);
    const rows = await as(db, "authenticated", admin, async (c) =>
      (await c.query("select * from public.orders")).rows, { aal: "aal1" });
    expect(rows).toHaveLength(0);
    const upd = await as(db, "authenticated", admin, (c) =>
      c.query("update public.events set title = 'x' where id = $1", [eventId]), { aal: "aal1" });
    expect(upd.rowCount).toBe(0);
    const err = await expectError(as(db, "authenticated", checkin, (c) =>
      c.query("select public.event_attendance($1)", [eventId]), { aal: "aal1" }));
    expect(err.message).toMatch(/forbidden/);
    // The same users with an MFA-verified session do have access.
    const ok = await as(db, "authenticated", admin, async (c) => (await c.query("select * from public.orders")).rows);
    expect(ok.length).toBeGreaterThan(0);
  });
});

describe("archive", () => {
  it("hides the event publicly, blocks publishing and purchases, and is reversible", async () => {
    const { eventId, tierIds } = await createEvent(db);
    await as(db, "authenticated", admin, (c) => c.query("update public.events set archived_at = now() where id = $1", [eventId]));
    const visible = await as(db, "anon", null, async (c) => (await c.query("select id from public.events where id = $1", [eventId])).rows);
    expect(visible).toHaveLength(0);
    expect(await opts(eventId)).toHaveLength(0);
    const err = await expectError(createOrder(db, { eventId, items: [{ ticket_type_id: tierIds[0], quantity: 1 }] }));
    expect(err.message).toMatch(/event_unavailable/);
    // Archiving unpublished it; re-publishing while archived is rejected.
    const st = await db.pool.query("select status, is_featured from public.events where id = $1", [eventId]);
    expect(st.rows[0]).toEqual({ status: "draft", is_featured: false });
    const pub = await expectError(as(db, "authenticated", admin, (c) =>
      c.query("update public.events set status = 'published' where id = $1", [eventId])));
    expect(pub.message).toMatch(/Archived events cannot be published/);
    // Unarchive + republish restores it.
    await as(db, "authenticated", admin, (c) =>
      c.query("update public.events set archived_at = null, status = 'published' where id = $1", [eventId]));
    expect(await opts(eventId)).toHaveLength(1);
  });

  it("archived events are excluded from check-in staff's event list but kept for admins", async () => {
    const { eventId } = await createEvent(db);
    await db.pool.query("update public.events set archived_at = now(), status = 'completed' where id = $1", [eventId]);
    const staffList = await as(db, "authenticated", checkin, async (c) =>
      (await c.query("select id from public.admin_events_overview()")).rows.map((r) => r.id));
    expect(staffList).not.toContain(eventId);
    const adminList = await as(db, "authenticated", admin, async (c) =>
      (await c.query("select id from public.admin_events_overview()")).rows.map((r) => r.id));
    expect(adminList).toContain(eventId);
  });
});

describe("registration deadline", () => {
  it("caps every tier's sales window and blocks checkout after it passes", async () => {
    const { eventId, tierIds } = await createEvent(db, { tiers: [{}, { sales_end_at: new Date(Date.now() + 20 * 86_400_000).toISOString() }] });
    await as(db, "authenticated", admin, (c) =>
      c.query("update public.events set registration_closes_at = now() - interval '1 minute' where id = $1", [eventId]));
    expect((await opts(eventId)).map((o) => o.display_state)).toEqual(["ended", "ended"]);
    const err = await expectError(createOrder(db, { eventId, items: [{ ticket_type_id: tierIds[0], quantity: 1 }] }));
    expect(err.message).toMatch(/ticket_type_not_on_sale/);
  });

  it("must be before the event ends", async () => {
    const { eventId } = await createEvent(db);
    const err = await expectError(as(db, "authenticated", admin, (c) =>
      c.query("update public.events set registration_closes_at = ends_at + interval '1 day' where id = $1", [eventId])));
    expect(err.message).toMatch(/Registration deadline/);
  });
});

describe("preview", () => {
  it("admins can compute ticket options for a draft as if published; the public cannot", async () => {
    const { eventId } = await createEvent(db, { publish: false });
    expect(await opts(eventId)).toHaveLength(0);
    const preview = await opts(eventId, admin);
    expect(preview[0].display_state).toBe("on_sale");
    expect(await opts(eventId, checkin)).toHaveLength(0); // check-in staff aren't admins
  });
});

describe("duplicate, reorder, attendee edit", () => {
  it("duplicates an event as a draft with tiers and questions but no sales", async () => {
    const { eventId, tierIds } = await createEvent(db, { tiers: [{ name: "Early" }, { name: "General" }] });
    await db.pool.query("insert into public.event_questions (event_id, label) values ($1, 'Dietary needs?')", [eventId]);
    const o = await createOrder(db, { eventId, items: [{ ticket_type_id: tierIds[0], quantity: 2 }] });
    await payOrder(db, o.order_id);
    const copyId = await as(db, "authenticated", admin, async (c) =>
      (await c.query("select public.admin_duplicate_event($1) as id", [eventId])).rows[0].id);
    const { rows } = await db.pool.query("select slug, title, status, published_at, admissions_sold from public.events where id = $1", [copyId]);
    expect(rows[0]).toMatchObject({ status: "draft", published_at: null, admissions_sold: 0 });
    expect(rows[0].slug).toMatch(/-copy$/);
    expect(rows[0].title).toMatch(/\(copy\)$/);
    const tiers = await db.pool.query("select name, quantity_sold from public.ticket_types where event_id = $1 order by sort_order", [copyId]);
    expect(tiers.rows).toEqual([{ name: "Early", quantity_sold: 0 }, { name: "General", quantity_sold: 0 }]);
    const q = await db.pool.query("select count(*)::int n from public.event_questions where event_id = $1", [copyId]);
    expect(q.rows[0].n).toBe(1);
    // A second duplicate gets a distinct slug.
    const copy2 = await as(db, "authenticated", admin, async (c) =>
      (await c.query("select public.admin_duplicate_event($1) as id", [eventId])).rows[0].id);
    const s2 = await db.pool.query("select slug from public.events where id = $1", [copy2]);
    expect(s2.rows[0].slug).toMatch(/-copy-2$/);
    const err = await expectError(as(db, "authenticated", checkin, (c) => c.query("select public.admin_duplicate_event($1)", [eventId])));
    expect(err.message).toMatch(/forbidden/);
  });

  it("reorders tiers only with the exact set of the event's tiers", async () => {
    const { eventId, tierIds } = await createEvent(db, { tiers: [{ name: "A" }, { name: "B" }, { name: "C" }] });
    await as(db, "authenticated", admin, (c) =>
      c.query("select public.admin_reorder_ticket_types($1, $2::uuid[])", [eventId, [tierIds[2], tierIds[0], tierIds[1]]]));
    const { rows } = await db.pool.query("select name from public.ticket_types where event_id = $1 order by sort_order", [eventId]);
    expect(rows.map((r) => r.name)).toEqual(["C", "A", "B"]);
    const err = await expectError(as(db, "authenticated", admin, (c) =>
      c.query("select public.admin_reorder_ticket_types($1, $2::uuid[])", [eventId, [tierIds[0]]])));
    expect(err.message).toMatch(/invalid_request/);
  });

  it("corrects an attendee (normalised, audited); check-in staff cannot", async () => {
    const { eventId, tierIds } = await createEvent(db);
    const o = await createOrder(db, { eventId, items: [{ ticket_type_id: tierIds[0], quantity: 1 }] });
    const att = (await db.pool.query("select id from public.attendees where order_id = $1", [o.order_id])).rows[0].id;
    await as(db, "authenticated", admin, (c) =>
      c.query("select public.admin_update_attendee($1, ' Corrected Name ', ' NEW@Example.test ', '')", [att]));
    const { rows } = await db.pool.query("select full_name, email, phone from public.attendees where id = $1", [att]);
    expect(rows[0]).toEqual({ full_name: "Corrected Name", email: "new@example.test", phone: null });
    const audit = await db.pool.query("select before_data->>'full_name' b, after_data->>'full_name' a, actor_user_id from public.audit_log where action = 'attendee.update' and entity_id = $1", [att]);
    expect(audit.rows[0]).toEqual({ b: "Sample Guest 1", a: "Corrected Name", actor_user_id: admin });
    const err = await expectError(as(db, "authenticated", checkin, (c) =>
      c.query("select public.admin_update_attendee($1, 'x', 'x@y.co', '')", [att])));
    expect(err.message).toMatch(/forbidden/);
  });
});

describe("dashboard data", () => {
  it("financial columns are hidden from check-in staff", async () => {
    const { eventId, tierIds } = await createEvent(db, { tiers: [{ price_cents: 4000 }] });
    const o = await createOrder(db, { eventId, items: [{ ticket_type_id: tierIds[0], quantity: 2 }] });
    await payOrder(db, o.order_id);
    const asAdmin = await as(db, "authenticated", owner, async (c) =>
      (await c.query("select * from public.admin_events_overview() where id = $1", [eventId])).rows[0]);
    expect(asAdmin).toMatchObject({ tickets_valid: 2, orders_paid: 1, gross_cents: "8000" });
    const asCheckin = await as(db, "authenticated", checkin, async (c) =>
      (await c.query("select * from public.admin_events_overview() where id = $1", [eventId])).rows[0]);
    expect(asCheckin).toMatchObject({ tickets_valid: 2, orders_paid: null, gross_cents: null, refunded_cents: null });
  });

  it("per-tier stats show sold, held and remaining", async () => {
    const { eventId, tierIds } = await createEvent(db, { tiers: [{ capacity: 10 }] });
    const paid = await createOrder(db, { eventId, items: [{ ticket_type_id: tierIds[0], quantity: 3 }] });
    await payOrder(db, paid.order_id);
    await createOrder(db, { eventId, items: [{ ticket_type_id: tierIds[0], quantity: 2 }] }); // pending hold
    const stats = await as(db, "authenticated", admin, async (c) =>
      (await c.query("select * from public.admin_ticket_type_stats($1)", [eventId])).rows[0]);
    expect(stats).toMatchObject({ units_sold: 3, units_held: 2, units_remaining: 5, has_orders: true });
    const err = await expectError(as(db, "authenticated", checkin, (c) => c.query("select * from public.admin_ticket_type_stats($1)", [eventId])));
    expect(err.message).toMatch(/forbidden/);
  });
});

describe("event media", () => {
  it("only admins write; the public sees gallery images of visible events only", async () => {
    const { eventId } = await createEvent(db);
    const path = `events/${eventId}/${crypto.randomUUID()}.webp`;
    const err = await expectError(as(db, "authenticated", checkin, (c) =>
      c.query("insert into public.event_media (event_id, storage_path) values ($1, $2)", [eventId, path])));
    expect(err.message).toMatch(/row-level security/);
    await as(db, "authenticated", admin, (c) =>
      c.query("insert into public.event_media (event_id, storage_path, show_in_gallery) values ($1, $2, false)", [eventId, path]));
    const hidden = await as(db, "anon", null, async (c) => (await c.query("select id from public.event_media where event_id = $1", [eventId])).rows);
    expect(hidden).toHaveLength(0);
    await as(db, "authenticated", admin, (c) => c.query("update public.event_media set show_in_gallery = true where storage_path = $1", [path]));
    const shown = await as(db, "anon", null, async (c) => (await c.query("select storage_path from public.event_media where event_id = $1", [eventId])).rows);
    expect(shown).toEqual([{ storage_path: path }]);
  });

  it("rejects paths outside the event's folder or with unexpected extensions", async () => {
    const { eventId } = await createEvent(db);
    const other = await createEvent(db);
    for (const bad of [
      `events/${other.eventId}/${crypto.randomUUID()}.webp`,
      `events/${eventId}/${crypto.randomUUID()}.svg`,
      `../secrets/${crypto.randomUUID()}.webp`,
    ]) {
      const err = await expectError(as(db, "authenticated", admin, (c) =>
        c.query("insert into public.event_media (event_id, storage_path) values ($1, $2)", [eventId, bad])));
      expect(err.message).toMatch(/check constraint/);
    }
  });
});
