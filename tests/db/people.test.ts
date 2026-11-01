/**
 * People list: one row per email across buyers, guests, waitlists, messages and
 * newsletter sign-ups; owners/admins only; marketing permission only from the
 * newsletter list; exports audited.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createEvent, createOrder, createStaff, createTestDb, expectError, payOrder, type TestDb } from "./helpers";

let db: TestDb;
let owner: string, checkin: string;

type Person = { email: string; name: string | null; events_registered: number; events_attended: number; events_missed: number; inquiries: number; interest: number; marketing: string; tags: string[]; total_count: string };
const people = (segment = "all", search: string | null = null, tag: string | null = null) =>
  as(db, "authenticated", owner, async (c) => (await c.query(
    "select * from public.admin_people($1, $2, $3, 200, 0)", [search, segment, tag])).rows as Person[]);
const emails = (rows: Person[]) => rows.map((r) => r.email).sort();

beforeAll(async () => {
  db = await createTestDb("people");
  owner = await createStaff(db, "owner");
  checkin = await createStaff(db, "checkin");

  // A past event: Guest1 checks in, Guest2 doesn't (a no-show).
  const past = await createEvent(db, { tiers: [{ price_cents: 0 }] });
  const o1 = await createOrder(db, { eventId: past.eventId, items: [{ ticket_type_id: past.tierIds[0], quantity: 2 }] });
  await payOrder(db, o1.order_id);
  await db.pool.query("update public.tickets t set checked_in_at = now() from public.attendees a where a.id = t.attendee_id and a.email = 'guest1@example.test'");
  await db.pool.query("update public.events set starts_at = now() - interval '3 day', ends_at = now() - interval '2 day' where id = $1", [past.eventId]);

  // Same buyer on a future event; an abandoned (pending) order is not a person yet.
  const future = await createEvent(db, { tiers: [{ price_cents: 0 }] });
  const o2 = await createOrder(db, { eventId: future.eventId, items: [{ ticket_type_id: future.tierIds[0], quantity: 1 }] });
  await payOrder(db, o2.order_id);
  const pendingOrder = await createOrder(db, { eventId: future.eventId, items: [{ ticket_type_id: future.tierIds[0], quantity: 1 }] });
  await db.pool.query("update public.orders set purchaser_email = 'abandoned@example.test' where id = $1", [pendingOrder.order_id]);

  await db.pool.query("insert into public.event_interest (event_id, kind, name, email) values ($1, 'waitlist', 'Wait Lister', 'wait@example.test')", [future.eventId]);
  await db.pool.query(`insert into public.contact_submissions (name, email, topic, message) values
    ('Ina Quiry', 'ina@example.test', 'general', 'Do you host private events?'),
    ('Spammy', 'spam@example.test', 'general', 'buy now')`);
  await db.pool.query("update public.contact_submissions set status = 'spam' where email = 'spam@example.test'");
  await db.pool.query(`insert into public.newsletter_subscribers (email, source) values ('buyer@example.test', 'footer'), ('gone@example.test', 'footer')`);
  await db.pool.query("update public.newsletter_subscribers set unsubscribed_at = now() where email = 'gone@example.test'");
});
afterAll(async () => db?.close());

describe("people list", () => {
  it("merges every interaction into one row per email (case-insensitive) and skips spam and abandoned checkouts", async () => {
    const all = await people();
    expect(emails(all)).toEqual(["buyer@example.test", "gone@example.test", "guest1@example.test", "guest2@example.test", "ina@example.test", "wait@example.test"]);
    const buyer = all.find((p) => p.email === "buyer@example.test")!;
    expect(buyer).toMatchObject({ name: "Sample Purchaser", events_registered: 2, marketing: "yes" });
    expect(Number(buyer.total_count)).toBe(6);
  });

  it("segments: attended, no-shows at past events, inquired, waitlists, marketing permission", async () => {
    expect(emails(await people("attended"))).toEqual(["guest1@example.test"]);
    expect(emails(await people("missed"))).toEqual(["guest2@example.test"]);
    expect(emails(await people("inquired"))).toEqual(["ina@example.test"]);
    expect(emails(await people("interested"))).toEqual(["wait@example.test"]);
    expect(emails(await people("subscribed"))).toEqual(["buyer@example.test"]);
    const gone = (await people("all", "gone@")).at(0)!;
    expect(gone.marketing).toBe("unsubscribed");
    expect(emails(await people("not_subscribed"))).not.toContain("buyer@example.test");
  });

  it("search, tags and notes", async () => {
    expect(emails(await people("all", "INA"))).toEqual(["ina@example.test"]);
    await as(db, "authenticated", owner, (c) => c.query(
      "insert into public.people_notes (email, notes, tags, updated_by) values ('guest1@example.test', 'Loved the brunch', '{vip}', $1)", [owner]));
    expect(emails(await people("all", null, "VIP"))).toEqual(["guest1@example.test"]);
    const person = await as(db, "authenticated", owner, async (c) => (await c.query("select public.admin_person('Guest1@Example.test') as p")).rows[0].p);
    expect(person).toMatchObject({ email: "guest1@example.test", notes: "Loved the brunch", tags: ["vip"], events_attended: 1 });
    expect(person.timeline.map((t: { kind: string }) => t.kind)).toContain("attended");
  });

  it("is for MFA-verified owners/admins only", async () => {
    await expectError(as(db, "authenticated", checkin, (c) => c.query("select * from public.admin_people()")));
    await expectError(as(db, "authenticated", owner, (c) => c.query("select * from public.admin_people()"), { aal: "aal1" }));
    await expectError(as(db, "anon", null, (c) => c.query("select * from public.admin_people()")));
    await expectError(as(db, "authenticated", owner, (c) => c.query("select * from public.people_summary()")));
    await expectError(as(db, "authenticated", checkin, (c) => c.query(
      "insert into public.people_notes (email, notes, updated_by) values ('x@example.test', 'n', $1)", [checkin])));
    const notes = await as(db, "authenticated", checkin, (c) => c.query("select * from public.people_notes"));
    expect(notes.rowCount).toBe(0);
  });

  it("exports are audited", async () => {
    const rows = await as(db, "authenticated", owner, async (c) => (await c.query("select * from public.export_people(null, 'attended', null)")).rows);
    expect(rows.map((r) => r.email)).toEqual(["guest1@example.test"]);
    const { rows: audit } = await db.pool.query("select action, actor_user_id from public.audit_log where action = 'export.people'");
    expect(audit).toEqual([{ action: "export.people", actor_user_id: owner }]);
  });
});
