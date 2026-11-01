/**
 * Privilege + RLS boundaries (ACCEPTANCE_TESTS.md › Admin and security).
 * Runs as the real Supabase API roles against migrations that were applied on
 * top of Supabase's permissive default privileges.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  as, createEvent, createOrder, createStaff, createTestDb, createUser, expectError, payOrder,
  type TestDb,
} from "./helpers";

let db: TestDb;
let owner: string, admin: string, checkin: string, randomUser: string;
let published: { eventId: string; tierIds: string[] };
let draft: { eventId: string; tierIds: string[] };

const PRIVATE_TABLES = [
  "orders", "order_items", "attendees", "tickets", "check_ins", "refunds", "inventory_holds",
  "email_messages", "audit_log", "contact_submissions", "newsletter_subscribers", "event_interest",
  "stripe_events", "rate_limits", "admin_profiles", "ticket_types",
];

beforeAll(async () => {
  db = await createTestDb("security");
  owner = await createStaff(db, "owner");
  admin = await createStaff(db, "admin");
  checkin = await createStaff(db, "checkin");
  randomUser = await createUser(db);
  published = await createEvent(db);
  draft = await createEvent(db, { publish: false });
  const o = await createOrder(db, { eventId: published.eventId, items: [{ ticket_type_id: published.tierIds[0], quantity: 2 }] });
  await payOrder(db, o.order_id);
});
afterAll(async () => db?.close());

describe("anonymous visitors", () => {
  it.each(PRIVATE_TABLES)("cannot read %s", async (table) => {
    const err = await expectError(as(db, "anon", null, (c) => c.query(`select * from public.${table} limit 1`)));
    expect(err.message).toMatch(/permission denied/);
  });

  it.each(["orders", "attendees", "tickets", "check_ins", "events", "ticket_types", "audit_log"])(
    "cannot insert/update/delete/truncate %s",
    async (table) => {
      for (const sql of [
        `delete from public.${table}`,
        `update public.${table} set ${table === "audit_log" ? "action = action" : "id = id"}`,
        `truncate public.${table} cascade`,
      ]) {
        const err = await expectError(as(db, "anon", null, (c) => c.query(sql)));
        expect(err.message).toMatch(/permission denied/);
      }
    },
  );

  it("sees only published events, never drafts", async () => {
    const rows = await as(db, "anon", null, async (c) =>
      (await c.query("select id, status from public.events")).rows);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(published.eventId);
    expect(ids).not.toContain(draft.eventId);
  });

  it("cannot read capacity / sales counters on events", async () => {
    const err = await expectError(as(db, "anon", null, (c) =>
      c.query("select admissions_sold from public.events")));
    expect(err.message).toMatch(/permission denied/);
    await expectError(as(db, "anon", null, (c) => c.query("select capacity from public.events")));
  });

  it("gets ticket options for published events only, without raw counters", async () => {
    const opts = await as(db, "anon", null, async (c) =>
      (await c.query("select * from public.get_event_ticket_options($1)", [published.eventId])).rows);
    expect(opts).toHaveLength(1);
    expect(opts[0]).not.toHaveProperty("quantity_sold");
    expect(opts[0]).not.toHaveProperty("capacity");
    const none = await as(db, "anon", null, async (c) =>
      (await c.query("select * from public.get_event_ticket_options($1)", [draft.eventId])).rows);
    expect(none).toHaveLength(0);
  });

  it.each([
    ["create_pending_order", "select public.create_pending_order('{}'::jsonb)"],
    ["fulfill_order", "select public.fulfill_order(gen_random_uuid(), '{}'::jsonb, '[]'::jsonb)"],
    ["record_refund", "select public.record_refund(gen_random_uuid(), 1, '{}', false, null, 'admin', null)"],
    ["sweep_expired", "select public.sweep_expired()"],
    ["check_rate_limit", "select public.check_rate_limit('x', repeat('a',64), 1, 60)"],
    ["check_in_by_credential", "select public.check_in_by_credential(gen_random_uuid(), repeat('a',64))"],
    ["export_attendees", "select * from public.export_attendees(gen_random_uuid())"],
    ["write_audit", "select public.write_audit('x','y','z')"],
    ["is_admin", "select public.is_admin()"],
  ])("cannot execute %s", async (_name, sql) => {
    const err = await expectError(as(db, "anon", null, (c) => c.query(sql)));
    expect(err.message).toMatch(/permission denied/);
  });
});

describe("authenticated users who are not staff", () => {
  it.each(["orders", "attendees", "tickets", "check_ins", "audit_log", "contact_submissions"])(
    "see zero rows in %s",
    async (table) => {
      const rows = await as(db, "authenticated", randomUser, async (c) =>
        (await c.query(`select * from public.${table}`)).rows);
      expect(rows).toHaveLength(0);
    },
  );

  it("cannot create or edit events", async () => {
    const err = await expectError(as(db, "authenticated", randomUser, (c) =>
      c.query("insert into public.events (slug, title) values ('hack', 'Hack')")));
    expect(err.message).toMatch(/row-level security/);
    const upd = await as(db, "authenticated", randomUser, (c) =>
      c.query("update public.events set title = 'Hacked' where id = $1", [published.eventId]));
    expect(upd.rowCount).toBe(0);
  });

  it("cannot grant themselves admin", async () => {
    const err = await expectError(as(db, "authenticated", randomUser, (c) =>
      c.query("insert into public.admin_profiles (user_id, role) values ($1, 'owner')", [randomUser])));
    expect(err.message).toMatch(/permission denied/);
    const err2 = await expectError(as(db, "authenticated", randomUser, (c) =>
      c.query("select public.owner_set_staff($1, 'owner', true)", [randomUser])));
    expect(err2.message).toMatch(/forbidden/);
  });

  it("cannot use check-in or export functions", async () => {
    for (const sql of [
      ["select public.check_in_by_credential($1, repeat('a',64))", [published.eventId]],
      ["select * from public.lookup_tickets($1, 'Sample')", [published.eventId]],
      ["select * from public.export_attendees($1)", [published.eventId]],
      ["select public.event_attendance($1)", [published.eventId]],
    ] as const) {
      const err = await expectError(as(db, "authenticated", randomUser, (c) => c.query(sql[0], [...sql[1]])));
      expect(err.message).toMatch(/forbidden/);
    }
  });
});

describe("check-in staff", () => {
  it("cannot read orders or financial data directly", async () => {
    const rows = await as(db, "authenticated", checkin, async (c) =>
      (await c.query("select * from public.orders")).rows);
    expect(rows).toHaveLength(0);
    const err = await expectError(as(db, "authenticated", checkin, (c) =>
      c.query("select * from public.export_sales($1)", [published.eventId])));
    expect(err.message).toMatch(/forbidden/);
  });

  it("cannot edit events or ticket types", async () => {
    const r = await as(db, "authenticated", checkin, (c) =>
      c.query("update public.ticket_types set price_cents = 1 where event_id = $1", [published.eventId]));
    expect(r.rowCount).toBe(0);
  });

  it("can look up tickets and view attendance", async () => {
    const rows = await as(db, "authenticated", checkin, async (c) =>
      (await c.query("select * from public.lookup_tickets($1, 'sample guest')", [published.eventId])).rows);
    expect(rows.length).toBe(2);
    expect(rows[0].ticket_type).toBeTruthy();
  });

  it("is blocked once deactivated", async () => {
    const tmp = await createStaff(db, "checkin", "temp");
    await db.pool.query("update public.admin_profiles set is_active = false where user_id = $1", [tmp]);
    const err = await expectError(as(db, "authenticated", tmp, (c) =>
      c.query("select public.event_attendance($1)", [published.eventId])));
    expect(err.message).toMatch(/forbidden/);
  });
});

describe("admins", () => {
  it("can read orders, attendees, tickets", async () => {
    for (const t of ["orders", "attendees", "tickets"]) {
      const rows = await as(db, "authenticated", admin, async (c) =>
        (await c.query(`select * from public.${t}`)).rows);
      expect(rows.length).toBeGreaterThan(0);
    }
  });

  it("cannot write commerce tables directly", async () => {
    for (const sql of [
      "update public.orders set status = 'paid'",
      "update public.tickets set status = 'valid'",
      "delete from public.attendees",
      "insert into public.check_ins (station_event_id, result, method) values (gen_random_uuid(), 'accepted', 'qr')",
    ]) {
      const err = await expectError(as(db, "authenticated", admin, (c) => c.query(sql)));
      expect(err.message).toMatch(/permission denied/);
    }
  });

  it("cannot tamper with server-maintained inventory counters", async () => {
    const err = await expectError(as(db, "authenticated", admin, (c) =>
      c.query("update public.ticket_types set quantity_sold = 0 where event_id = $1", [published.eventId])));
    expect(err.message).toMatch(/permission denied/);
    const err2 = await expectError(as(db, "authenticated", admin, (c) =>
      c.query("update public.events set admissions_sold = 0 where id = $1", [published.eventId])));
    expect(err2.message).toMatch(/permission denied/);
  });

  it("cannot delete a published event", async () => {
    const r = await as(db, "authenticated", admin, (c) =>
      c.query("delete from public.events where id = $1", [published.eventId]));
    expect(r.rowCount).toBe(0);
  });

  it("can see their own profile; only the owner sees all staff", async () => {
    const mine = await as(db, "authenticated", admin, async (c) =>
      (await c.query("select * from public.admin_profiles")).rows);
    expect(mine).toHaveLength(1);
    const all = await as(db, "authenticated", owner, async (c) =>
      (await c.query("select * from public.admin_profiles")).rows);
    expect(all.length).toBeGreaterThanOrEqual(3);
  });

  it("cannot manage staff (owner only); owner cannot remove the last owner", async () => {
    const err = await expectError(as(db, "authenticated", admin, (c) =>
      c.query("select public.owner_set_staff($1, 'owner', true)", [admin])));
    expect(err.message).toMatch(/forbidden/);
    const err2 = await expectError(as(db, "authenticated", owner, (c) =>
      c.query("select public.owner_set_staff($1, 'admin', true)", [owner])));
    expect(err2.message).toMatch(/last_owner/);
  });
});

describe("service role (server secret key)", () => {
  it("cannot truncate tables or rewrite the audit log", async () => {
    const err = await expectError(as(db, "service_role", null, (c) => c.query("truncate public.orders cascade")));
    expect(err.message).toMatch(/permission denied/);
    for (const sql of ["update public.audit_log set action = 'x'", "delete from public.audit_log"]) {
      const e = await expectError(as(db, "service_role", null, (c) => c.query(sql)));
      expect(e.message).toMatch(/permission denied/);
    }
  });

  it("cannot call internal helpers directly", async () => {
    const err = await expectError(as(db, "service_role", null, (c) =>
      c.query("select public.write_audit('x','y','z')")));
    expect(err.message).toMatch(/permission denied/);
  });

  it("audit_log is append-only even for the table owner", async () => {
    const err = await expectError(db.pool.query("delete from public.audit_log"));
    expect(err.message).toMatch(/append-only/);
  });
});

describe("RLS coverage", () => {
  it("every public table has RLS enabled", async () => {
    const { rows } = await db.pool.query(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(rows).toEqual([]);
  });

  it("every SECURITY DEFINER function pins search_path", async () => {
    const { rows } = await db.pool.query(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef
         and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')`);
    expect(rows).toEqual([]);
  });
});
