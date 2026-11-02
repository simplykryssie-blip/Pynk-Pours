/**
 * Form builder: visitors see open/closed forms only and never responses;
 * MFA-verified owners/admins build forms and review responses; status changes
 * and exports are audited; form emails are allowed in the outbox; responses
 * appear in the People list.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createStaff, createTestDb, expectError, type TestDb } from "./helpers";

let db: TestDb;
let owner: string, checkin: string;
let openId: string, draftId: string, subId: string;

const fields = JSON.stringify([{ key: "email", type: "email", label: "Email", required: true }]);

beforeAll(async () => {
  db = await createTestDb("forms");
  owner = await createStaff(db, "owner");
  checkin = await createStaff(db, "checkin");
  const ins = (slug: string, status: string) => as(db, "authenticated", owner, async (c) => (await c.query(
    "insert into public.forms (slug, title, status, fields, updated_by) values ($1, 'Form', $2, $3::jsonb, $4) returning id", [slug, status, fields, owner])).rows[0].id as string);
  openId = await ins("vendor-application", "open");
  draftId = await ins("secret-draft", "draft");
  // The server (secret key) writes responses after validating them.
  subId = (await db.pool.query(
    `insert into public.form_submissions (form_id, data, name, email, status_token_hash, status_token_ciphertext)
     values ($1, '{"email":"vendor@example.test"}', 'Val Vendor', 'vendor@example.test', 'hash-1', 'cipher') returning id`, [openId])).rows[0].id;
});
afterAll(async () => db?.close());

describe("forms", () => {
  it("visitors see open forms but not drafts, and never responses or files", async () => {
    const forms = await as(db, "anon", null, (c) => c.query("select slug from public.forms order by slug"));
    expect(forms.rows).toEqual([{ slug: "vendor-application" }]);
    await expectError(as(db, "anon", null, (c) => c.query("select * from public.form_submissions")));
    await expectError(as(db, "anon", null, (c) => c.query(
      "insert into public.form_submissions (form_id, data, email, status_token_hash, status_token_ciphertext) values ($1, '{}', 'x@example.test', 'h', 'c')", [openId])));
  });

  it("check-in staff and password-only sessions can't see responses or edit forms", async () => {
    const seen = await as(db, "authenticated", checkin, (c) => c.query("select * from public.form_submissions"));
    expect(seen.rowCount).toBe(0);
    const drafts = await as(db, "authenticated", checkin, (c) => c.query("select 1 from public.forms where id = $1", [draftId]));
    expect(drafts.rowCount).toBe(0);
    await expectError(as(db, "authenticated", owner, (c) => c.query("select * from public.export_form_responses($1)", [openId]), { aal: "aal1" }));
    const upd = await as(db, "authenticated", checkin, (c) => c.query("update public.forms set title = 'x', updated_by = $1 where id = $2", [checkin, openId]));
    expect(upd.rowCount).toBe(0);
  });

  it("owners review responses: status, history and notes are attributed and audited", async () => {
    await as(db, "authenticated", owner, async (c) => {
      await c.query("update public.form_submissions set status = 'approved', reviewed_at = now(), reviewed_by = $1 where id = $2", [owner, subId]);
      await c.query("insert into public.form_status_updates (submission_id, status, message, notify, created_by) values ($1, 'approved', 'Booth 4', true, $2)", [subId, owner]);
    });
    await expectError(as(db, "authenticated", owner, (c) => c.query(
      "update public.form_submissions set status = 'declined', reviewed_by = $1 where id = $2", [checkin, subId])));
    await expectError(as(db, "authenticated", owner, (c) => c.query(
      "update public.form_submissions set email = 'changed@example.test', reviewed_by = $1 where id = $2", [owner, subId])));
    const { rows } = await db.pool.query("select action from public.audit_log where entity_type = 'form_submissions' and entity_id = $1", [subId]);
    expect(rows.map((r) => r.action)).toContain("update");
  });

  it("form emails can be queued in the outbox", async () => {
    await db.pool.query("insert into public.email_messages (dedupe_key, kind, to_email) values ($1, 'form_receipt', 'vendor@example.test')", [`form_receipt:${subId}`]);
    await expectError(db.pool.query("insert into public.email_messages (dedupe_key, kind, to_email) values ('x:1', 'bogus_kind', 'a@example.test')"));
  });

  it("responses appear in the People list and person history", async () => {
    const person = await as(db, "authenticated", owner, async (c) => (await c.query("select public.admin_person('vendor@example.test') as p")).rows[0].p);
    expect(person).toMatchObject({ email: "vendor@example.test", name: "Val Vendor", inquiries: 1 });
    expect(person.timeline.map((t: { kind: string }) => t.kind)).toContain("form");
  });

  it("exports are audited; forms with responses can't be deleted; responses can", async () => {
    const rows = await as(db, "authenticated", owner, async (c) => (await c.query("select * from public.export_form_responses($1)", [openId])).rows);
    expect(rows).toHaveLength(1);
    const { rows: audit } = await db.pool.query("select actor_user_id from public.audit_log where action = 'export.form_responses'");
    expect(audit).toEqual([{ actor_user_id: owner }]);
    await expectError(db.pool.query("delete from public.forms where id = $1", [openId]));
    await as(db, "authenticated", owner, (c) => c.query("delete from public.form_submissions where id = $1", [subId]));
    const left = await db.pool.query("select count(*)::int n from public.form_status_updates where submission_id = $1", [subId]);
    expect(left.rows[0].n).toBe(0);
  });
});
