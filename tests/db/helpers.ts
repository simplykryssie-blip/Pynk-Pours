/**
 * Test helpers for the local disposable database. Fixture data created here is
 * SAMPLE DATA for tests only — it is never real PynkPours event information.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Client, Pool, type PoolClient } from "pg";
import { ADMIN_URL, TEMPLATE_DB, assertLocal } from "./config";

export type Role = "anon" | "authenticated" | "service_role";

export interface TestDb {
  name: string;
  pool: Pool;
  url: string;
  close: () => Promise<void>;
}

/** Clone the migrated template into a fresh database for one test file. */
export async function createTestDb(label: string): Promise<TestDb> {
  assertLocal();
  const name = `pp_test_${label}_${randomBytes(3).toString("hex")}`;
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`create database "${name}" template "${TEMPLATE_DB}"`);
  await admin.end();
  const url = ADMIN_URL.replace(/\/[^/]+$/, `/${name}`);
  const pool = new Pool({ connectionString: url, max: 60 });
  // Idle connections are terminated when the database is dropped at teardown.
  pool.on("error", () => {});
  return {
    name,
    pool,
    url,
    close: async () => {
      await pool.end();
      const a = new Client({ connectionString: ADMIN_URL });
      await a.connect();
      await a.query(`drop database if exists "${name}" with (force)`);
      await a.end();
    },
  };
}

/**
 * Run `fn` inside a transaction acting as a Supabase API role, exactly as
 * PostgREST would (SET LOCAL ROLE + request.jwt.claims). Commits on success.
 */
export async function as<T>(
  db: TestDb,
  role: Role,
  userId: string | null,
  fn: (c: PoolClient) => Promise<T>,
  opts: { aal?: "aal1" | "aal2" } = {},
): Promise<T> {
  const c = await db.pool.connect();
  try {
    await c.query("begin");
    // Signed-in users default to an MFA-verified session (aal2), as staff must be.
    const claims = JSON.stringify(userId ? { sub: userId, role, aal: opts.aal ?? "aal2" } : { role });
    await c.query("select set_config('request.jwt.claims', $1, true)", [claims]);
    await c.query(`set local role ${role}`);
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Expect a query to fail; returns the error. */
export async function expectError(p: Promise<unknown>): Promise<Error & { code?: string; detail?: string }> {
  try {
    await p;
  } catch (e) {
    return e as Error & { code?: string };
  }
  throw new Error("Expected query to fail, but it succeeded");
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const MANUAL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function manualCode(): string {
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => MANUAL_ALPHABET[b % MANUAL_ALPHABET.length]).join("");
}

export function newCredential() {
  const credential = randomBytes(32).toString("base64url");
  return { credential, hash: sha256(credential) };
}

// ---------------------------------------------------------------------------
// Fixtures (run as the migration owner, i.e. bypassing RLS — setup only)
// ---------------------------------------------------------------------------
export async function createUser(db: TestDb, email = `${randomUUID()}@example.test`): Promise<string> {
  const { rows } = await db.pool.query("insert into auth.users (email) values ($1) returning id", [email]);
  return rows[0].id;
}

export async function createStaff(db: TestDb, role: "owner" | "admin" | "checkin", name: string = role) {
  const id = await createUser(db);
  await db.pool.query(
    "insert into public.admin_profiles (user_id, role, display_name) values ($1, $2, $3)",
    [id, role, `Test ${name}`],
  );
  return id;
}

export interface TierSpec {
  name?: string;
  price_cents?: number;
  capacity?: number | null;
  max_per_order?: number | null;
  admits_per_unit?: number;
  status?: "active" | "paused" | "closed";
  sales_start_at?: string | null;
  sales_end_at?: string | null;
}

export interface EventSpec {
  capacity?: number | null;
  publish?: boolean;
  registration_mode?: "tickets" | "coming_soon" | "closed";
  max_tickets_per_order?: number;
  tiers?: TierSpec[];
  startsInDays?: number;
}

/** Creates a SAMPLE event + tiers and (optionally) publishes it. */
export async function createEvent(db: TestDb, spec: EventSpec = {}) {
  const slug = `sample-${randomBytes(4).toString("hex")}`;
  const starts = new Date(Date.now() + (spec.startsInDays ?? 30) * 86_400_000);
  const ends = new Date(starts.getTime() + 4 * 3_600_000);
  const { rows } = await db.pool.query(
    `insert into public.events (slug, title, short_description, starts_at, ends_at, timezone,
        venue_name, capacity, registration_mode, max_tickets_per_order)
     values ($1, 'SAMPLE EVENT — NOT REAL', 'Sample description', $2, $3, 'America/Chicago',
        'Sample Venue', $4, $5, $6) returning id`,
    [slug, starts, ends, spec.capacity ?? null, spec.registration_mode ?? "tickets",
     spec.max_tickets_per_order ?? 10],
  );
  const eventId: string = rows[0].id;
  const tierIds: string[] = [];
  let i = 0;
  for (const t of spec.tiers ?? [{}]) {
    const r = await db.pool.query(
      `insert into public.ticket_types (event_id, name, price_cents, capacity, max_per_order,
          admits_per_unit, status, sales_start_at, sales_end_at, sort_order)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
      [eventId, t.name ?? `Sample Tier ${i + 1}`, t.price_cents ?? 5000,
       t.capacity === undefined ? 100 : t.capacity, t.max_per_order ?? null,
       t.admits_per_unit ?? 1, t.status ?? "active", t.sales_start_at ?? null,
       t.sales_end_at ?? null, i],
    );
    tierIds.push(r.rows[0].id);
    i++;
  }
  if (spec.publish ?? true) {
    await db.pool.query("update public.events set status = 'published' where id = $1", [eventId]);
  }
  return { eventId, tierIds, slug };
}

export interface OrderInput {
  eventId: string;
  items: { ticket_type_id: string; quantity: number; admits?: number }[];
  idempotencyKey?: string;
  answers?: Record<string, string>;
  holdMinutes?: number;
}

export function orderPayload(o: OrderInput) {
  const attendees = o.items.flatMap((it) =>
    Array.from({ length: it.quantity * (it.admits ?? 1) }, (_, n) => ({
      ticket_type_id: it.ticket_type_id,
      full_name: `Sample Guest ${n + 1}`,
      email: `Guest${n + 1}@Example.test `,
      phone: null,
      answers: o.answers ?? {},
    })),
  );
  return {
    event_id: o.eventId,
    idempotency_key: o.idempotencyKey ?? `idem_${randomBytes(12).toString("hex")}`,
    public_token_hash: sha256(randomBytes(32).toString("base64url")),
    hold_minutes: o.holdMinutes ?? 35,
    purchaser: { name: "Sample Purchaser", email: " Buyer@Example.TEST ", phone: null },
    items: o.items.map(({ ticket_type_id, quantity }) => ({ ticket_type_id, quantity })),
    attendees,
    // A malicious client might send prices — the RPC must ignore them.
    total_cents: 1,
  };
}

export async function createOrder(db: TestDb, o: OrderInput) {
  return as(db, "service_role", null, async (c) => {
    const { rows } = await c.query("select public.create_pending_order($1::jsonb) as r", [
      JSON.stringify(orderPayload(o)),
    ]);
    return rows[0].r as {
      order_id: string; total_cents: number; currency: string; existing: boolean; status: string;
    };
  });
}

/** Builds the per-attendee ticket credential payload the app server would send. */
export async function ticketPayload(db: TestDb, orderId: string) {
  const { rows } = await db.pool.query(
    "select id from public.attendees where order_id = $1 order by position",
    [orderId],
  );
  const creds = rows.map((r) => {
    const c = newCredential();
    return {
      raw: c.credential,
      json: {
        attendee_id: r.id,
        credential_hash: c.hash,
        credential_ciphertext: `test-ciphertext-${randomBytes(12).toString("hex")}`,
        manual_code: manualCode(),
      },
    };
  });
  return { creds, json: creds.map((c) => c.json) };
}

export async function payOrder(
  db: TestDb,
  orderId: string,
  overrides: Partial<{ amount_total: number; currency: string; provider: string }> = {},
) {
  const { rows: o } = await db.pool.query(
    "select total_cents, currency from public.orders where id = $1",
    [orderId],
  );
  const tickets = await ticketPayload(db, orderId);
  const payment = {
    provider: overrides.provider ?? (o[0].total_cents === 0 ? "free" : "stripe"),
    checkout_session_id: `cs_test_${randomBytes(8).toString("hex")}`,
    payment_intent_id: `pi_test_${randomBytes(8).toString("hex")}`,
    amount_total: overrides.amount_total ?? o[0].total_cents,
    currency: overrides.currency ?? o[0].currency,
  };
  const result = await as(db, "service_role", null, async (c) => {
    const { rows } = await c.query("select public.fulfill_order($1, $2::jsonb, $3::jsonb) as r", [
      orderId, JSON.stringify(payment), JSON.stringify(tickets.json),
    ]);
    return rows[0].r as { outcome: string; ticket_ids?: string[]; reason?: string };
  });
  return { result, creds: tickets.creds, payment };
}
