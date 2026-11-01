/**
 * Backup & recovery drill (local). Proves that a logical backup of a populated
 * database restores with data, security policies and behaviour intact.
 *
 *  A) Full logical dump -> restore into an empty database (disaster recovery).
 *  B) Data-only dump -> restore into a freshly migrated database (the path used
 *     to move data into a NEW Supabase project). Requires triggers to be
 *     disabled during load (session_replication_role = replica), because the
 *     publish guard and audit triggers would otherwise reject historical rows.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client, Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADMIN_URL, PG_PORT, TEMPLATE_DB } from "./config";
import {
  as, createEvent, createOrder, createStaff, createTestDb, expectError, payOrder, sha256,
  type TestDb,
} from "./helpers";

const BIN = process.env.PGBIN ?? "/usr/lib/postgresql/16/bin";
const conn = ["-h", "127.0.0.1", "-p", PG_PORT, "-U", "postgres"];

let src: TestDb;
let workDir: string;
let checkin: string;
let eventId: string;
let checkedHash: string;
let freshHash: string;
const restored: string[] = [];

const TABLES = [
  "events", "ticket_types", "orders", "order_items", "attendees", "tickets", "check_ins",
  "inventory_holds", "email_messages", "audit_log", "admin_profiles", "refunds",
];

async function counts(dbName: string) {
  const c = new Client({ connectionString: ADMIN_URL.replace(/\/[^/]+$/, `/${dbName}`) });
  await c.connect();
  const out: Record<string, number> = {};
  for (const t of TABLES) out[t] = (await c.query(`select count(*)::int n from public.${t}`)).rows[0].n;
  out.policies = (await c.query("select count(*)::int n from pg_policies where schemaname = 'public'")).rows[0].n;
  out.rls_off = (await c.query(
    "select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity")).rows[0].n;
  await c.end();
  return out;
}

async function admin(sql: string) {
  const c = new Client({ connectionString: ADMIN_URL });
  await c.connect();
  await c.query(sql);
  await c.end();
}

function asTestDb(name: string): TestDb {
  const url = ADMIN_URL.replace(/\/[^/]+$/, `/${name}`);
  const pool = new Pool({ connectionString: url, max: 5 });
  pool.on("error", () => {});
  return { name, url, pool, close: () => pool.end() };
}

beforeAll(async () => {
  src = await createTestDb("backup");
  workDir = mkdtempSync(path.join(tmpdir(), "pp-backup-"));
  await createStaff(src, "owner");
  checkin = await createStaff(src, "checkin");
  const ev = await createEvent(src);
  eventId = ev.eventId;
  const o = await createOrder(src, { eventId, items: [{ ticket_type_id: ev.tierIds[0], quantity: 2 }] });
  const { creds } = await payOrder(src, o.order_id);
  checkedHash = sha256(creds[0].raw);
  freshHash = sha256(creds[1].raw);
  await as(src, "authenticated", checkin, (c) =>
    c.query("select public.check_in_by_credential($1, $2)", [eventId, checkedHash]));
  await createOrder(src, { eventId, items: [{ ticket_type_id: ev.tierIds[0], quantity: 1 }] }); // pending hold
});

afterAll(async () => {
  for (const d of restored) await admin(`drop database if exists "${d}" with (force)`);
  await src?.close();
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

async function verifyBehaviour(name: string) {
  const db = asTestDb(name);
  try {
    // Security still enforced
    const err = await expectError(as(db, "anon", null, (c) => c.query("select * from public.orders")));
    expect(err.message).toMatch(/permission denied/);
    // Check-in state preserved and functional
    const again = await as(db, "authenticated", checkin, async (c) =>
      (await c.query("select public.check_in_by_credential($1, $2) as r", [eventId, checkedHash])).rows[0].r);
    expect(again.result).toBe("already_checked_in");
    const fresh = await as(db, "authenticated", checkin, async (c) =>
      (await c.query("select public.check_in_by_credential($1, $2) as r", [eventId, freshHash])).rows[0].r);
    expect(fresh.result).toBe("accepted");
    // Sequences continue (no order_number reuse)
    const { rows } = await db.pool.query(
      "select (select max(order_number) from public.orders) as max_no, " +
      "pg_sequence_last_value(pg_get_serial_sequence('public.orders','order_number')) as seq");
    expect(Number(rows[0].seq)).toBeGreaterThanOrEqual(Number(rows[0].max_no));
    // Audit log still append-only
    expect((await expectError(db.pool.query("delete from public.audit_log"))).message).toMatch(/append-only/);
  } finally {
    await db.close();
  }
}

describe("backup and recovery", () => {
  it("A) full logical dump restores into an empty database intact", async () => {
    const file = path.join(workDir, "full.dump");
    execFileSync(path.join(BIN, "pg_dump"), [...conn, "-Fc", "-f", file, src.name]);
    const target = `${src.name}_restore_full`;
    restored.push(target);
    await admin(`create database "${target}" template template0`);
    execFileSync(path.join(BIN, "pg_restore"), [...conn, "-d", target, "--exit-on-error", file]);
    expect(await counts(target)).toEqual(await counts(src.name));
    await verifyBehaviour(target);
  });

  it("B) data-only dump restores into a freshly migrated database", async () => {
    const file = path.join(workDir, "data.sql");
    execFileSync(path.join(BIN, "pg_dump"), [
      ...conn, "--data-only", "--table=public.*", "--table=auth.users", "-f", file, src.name,
    ]);
    const target = `${src.name}_restore_data`;
    restored.push(target);
    await admin(`create database "${target}" template "${TEMPLATE_DB}"`);
    execFileSync(path.join(BIN, "psql"), [
      ...conn, "-d", target, "-v", "ON_ERROR_STOP=1", "-q",
      "-c", "set session_replication_role = replica;", "-f", file,
    ]);
    expect(await counts(target)).toEqual(await counts(src.name));
    await verifyBehaviour(target);
  });
});
