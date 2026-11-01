/**
 * Builds a template database (Supabase shim + all migrations) once per run.
 * Each test file clones it into its own disposable database.
 * LOCAL ONLY: refuses to run against anything but localhost.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { ADMIN_URL, TEMPLATE_DB, assertLocal } from "./config";

export default async function setup() {
  assertLocal();
  const root = process.cwd();
  execFileSync(path.join(root, "scripts/db/local-pg.sh"), ["start"], { stdio: "inherit" });

  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  // Drop stale per-file databases and the template from earlier runs.
  const { rows } = await admin.query(
    "select datname from pg_database where datname like 'pp_test_%' or datname = $1",
    [TEMPLATE_DB],
  );
  for (const r of rows) {
    await admin.query(`drop database if exists "${r.datname}" with (force)`);
  }
  await admin.query(`create database "${TEMPLATE_DB}"`);
  await admin.end();

  const db = new Client({ connectionString: ADMIN_URL.replace(/\/[^/]+$/, `/${TEMPLATE_DB}`) });
  await db.connect();
  try {
    await db.query("set client_min_messages = warning");
    await db.query(readFileSync(path.join(root, "supabase/tests/supabase-local-shim.sql"), "utf8"));
    const migDir = path.join(root, "supabase/migrations");
    for (const f of readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort()) {
      try {
        await db.query(readFileSync(path.join(migDir, f), "utf8"));
      } catch (e) {
        throw new Error(`Migration ${f} failed: ${(e as Error).message}`);
      }
    }
  } finally {
    await db.end();
  }
}
