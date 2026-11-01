/**
 * Concurrency: overselling and duplicate check-ins must be impossible even
 * under parallel load (ACCEPTANCE_TESTS.md › "Concurrent checkout attempts
 * cannot oversell", "Concurrent scans are race-safe; at most one succeeds").
 * Every request runs on its own connection in its own transaction.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  as, createEvent, createOrder, createStaff, createTestDb, orderPayload, payOrder, sha256,
  type TestDb,
} from "./helpers";

let db: TestDb;
let staff: string[];

beforeAll(async () => {
  db = await createTestDb("concurrency");
  staff = await Promise.all(Array.from({ length: 5 }, () => createStaff(db, "checkin")));
});
afterAll(async () => db?.close());

async function attemptReserve(eventId: string, ticketTypeId: string, quantity = 1, admits = 1) {
  try {
    const r = await as(db, "service_role", null, async (c) =>
      (await c.query("select public.create_pending_order($1::jsonb) as r", [
        JSON.stringify(orderPayload({ eventId, items: [{ ticket_type_id: ticketTypeId, quantity, admits }] })),
      ])).rows[0].r);
    return { ok: true as const, orderId: r.order_id as string };
  } catch (e) {
    return { ok: false as const, error: (e as Error).message };
  }
}

describe("inventory under contention", () => {
  it("50 simultaneous buyers for 10 seats: exactly 10 holds succeed", async () => {
    const { eventId, tierIds } = await createEvent(db, { tiers: [{ capacity: 10 }] });
    const results = await Promise.all(Array.from({ length: 50 }, () => attemptReserve(eventId, tierIds[0])));
    const ok = results.filter((r) => r.ok);
    expect(ok).toHaveLength(10);
    expect(results.filter((r) => !r.ok).every((r) => !r.ok && /sold_out/.test(r.error))).toBe(true);
    const { rows } = await db.pool.query(
      "select coalesce(sum(quantity),0)::int held from public.inventory_holds where ticket_type_id = $1 and status = 'active'",
      [tierIds[0]]);
    expect(rows[0].held).toBe(10);
  });

  it("event-level capacity is shared across tiers under contention", async () => {
    const { eventId, tierIds } = await createEvent(db, {
      capacity: 12, tiers: [{ capacity: null }, { capacity: null }, { capacity: null, admits_per_unit: 4 }],
    });
    const attempts = Array.from({ length: 30 }, (_, i) =>
      i % 3 === 2 ? attemptReserve(eventId, tierIds[2], 1, 4) : attemptReserve(eventId, tierIds[i % 3]));
    await Promise.all(attempts);
    const { rows } = await db.pool.query(
      "select coalesce(sum(admissions),0)::int adm from public.inventory_holds where event_id = $1 and status = 'active'",
      [eventId]);
    expect(rows[0].adm).toBeLessThanOrEqual(12);
    expect(rows[0].adm).toBeGreaterThanOrEqual(9); // capacity was actually used, not over-blocked
  });

  it("paying all successful holds never exceeds capacity", async () => {
    const { eventId, tierIds } = await createEvent(db, { tiers: [{ capacity: 5 }] });
    const results = await Promise.all(Array.from({ length: 20 }, () => attemptReserve(eventId, tierIds[0])));
    const ok = results.filter((r): r is { ok: true; orderId: string } => r.ok);
    await Promise.all(ok.map((r) => payOrder(db, r.orderId)));
    const { rows } = await db.pool.query("select quantity_sold, capacity from public.ticket_types where id = $1", [tierIds[0]]);
    expect(rows[0].quantity_sold).toBe(5);
  });

  it("duplicate concurrent fulfilment of one order issues tickets once", async () => {
    const { eventId, tierIds } = await createEvent(db);
    const o = await createOrder(db, { eventId, items: [{ ticket_type_id: tierIds[0], quantity: 3 }] });
    const results = await Promise.all(Array.from({ length: 8 }, () => payOrder(db, o.order_id)));
    const outcomes = results.map((r) => r.result.outcome).sort();
    expect(outcomes.filter((x) => x === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((x) => x === "already_fulfilled")).toHaveLength(7);
    const t = await db.pool.query("select count(*)::int n from public.tickets where order_id = $1", [o.order_id]);
    expect(t.rows[0].n).toBe(3);
    const e = await db.pool.query("select count(*)::int n from public.email_messages where order_id = $1", [o.order_id]);
    expect(e.rows[0].n).toBe(4); // 1 confirmation + 3 tickets
    const s = await db.pool.query("select quantity_sold from public.ticket_types where id = $1", [tierIds[0]]);
    expect(s.rows[0].quantity_sold).toBe(3);
  });
});

describe("check-in under contention", () => {
  it("20 simultaneous scans of one ticket from 5 devices: exactly 1 accepted", async () => {
    const { eventId, tierIds } = await createEvent(db);
    const o = await createOrder(db, { eventId, items: [{ ticket_type_id: tierIds[0], quantity: 1 }] });
    const { creds } = await payOrder(db, o.order_id);
    const hash = sha256(creds[0].raw);
    const scans = await Promise.all(Array.from({ length: 20 }, (_, i) =>
      as(db, "authenticated", staff[i % staff.length], async (c) =>
        (await c.query("select public.check_in_by_credential($1, $2) as r", [eventId, hash])).rows[0].r.result as string)));
    expect(scans.filter((s) => s === "accepted")).toHaveLength(1);
    expect(scans.filter((s) => s === "already_checked_in")).toHaveLength(19);
    const { rows } = await db.pool.query(
      "select result, count(*)::int n from public.check_ins where station_event_id = $1 group by result", [eventId]);
    expect(Object.fromEntries(rows.map((r) => [r.result, r.n]))).toEqual({ accepted: 1, already_checked_in: 19 });
  });

  it("mixed QR + manual check-in race still yields one acceptance", async () => {
    const { eventId, tierIds } = await createEvent(db);
    const o = await createOrder(db, { eventId, items: [{ ticket_type_id: tierIds[0], quantity: 1 }] });
    const { creds, result } = await payOrder(db, o.order_id);
    const ticketId = result.ticket_ids![0];
    const hash = sha256(creds[0].raw);
    const scans = await Promise.all(Array.from({ length: 10 }, (_, i) =>
      as(db, "authenticated", staff[i % staff.length], async (c) => {
        const q = i % 2 === 0
          ? c.query("select public.check_in_by_credential($1, $2) as r", [eventId, hash])
          : c.query("select public.check_in_by_ticket($1, $2) as r", [eventId, ticketId]);
        return (await q).rows[0].r.result as string;
      })));
    expect(scans.filter((s) => s === "accepted")).toHaveLength(1);
  });
});
