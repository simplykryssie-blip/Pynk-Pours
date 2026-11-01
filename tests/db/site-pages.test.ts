/**
 * Editable policy pages: everyone reads; only MFA-verified owners/admins write;
 * every change is audited; no deletes.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createStaff, createTestDb, expectError, type TestDb } from "./helpers";

let db: TestDb;
let owner: string, admin: string, checkin: string;

beforeAll(async () => {
  db = await createTestDb("site_pages");
  owner = await createStaff(db, "owner");
  admin = await createStaff(db, "admin");
  checkin = await createStaff(db, "checkin");
});
afterAll(async () => db?.close());

const write = (user: string, slug: string, body: string, opts?: { aal?: "aal1" | "aal2" }) =>
  as(db, "authenticated", user, (c) => c.query(
    "insert into public.site_pages (slug, title, body, updated_by) values ($1, 'Policy', $2, $3)", [slug, body, user]), opts);

describe("site pages (policies)", () => {
  it("an owner can publish and an admin can edit; anyone can read", async () => {
    await write(owner, "privacy", "Owner's first version.");
    await as(db, "authenticated", admin, (c) => c.query(
      "update public.site_pages set body = 'Admin edit.', updated_by = $1 where slug = 'privacy'", [admin]));
    const { rows } = await as(db, "anon", null, (c) => c.query("select slug, body from public.site_pages"));
    expect(rows).toEqual([{ slug: "privacy", body: "Admin edit." }]);
  });

  it("anonymous visitors, check-in staff and password-only sessions cannot write", async () => {
    await expectError(as(db, "anon", null, (c) => c.query(
      "insert into public.site_pages (slug, title, body) values ('terms', 'T', 'x')")));
    await expectError(write(checkin, "terms", "Check-in staff edit"));
    await expectError(write(owner, "terms", "Owner without MFA", { aal: "aal1" }));
    const updated = await as(db, "authenticated", checkin, (c) => c.query(
      "update public.site_pages set body = 'hijack', updated_by = $1 where slug = 'privacy'", [checkin]));
    expect(updated.rowCount).toBe(0);
    const { rows } = await db.pool.query("select body from public.site_pages where slug = 'privacy'");
    expect(rows[0].body).toBe("Admin edit.");
  });

  it("edits must be attributed to the editor, and pages can't be deleted", async () => {
    await expectError(as(db, "authenticated", admin, (c) => c.query(
      "update public.site_pages set body = 'spoof', updated_by = $1 where slug = 'privacy'", [owner])));
    await expectError(as(db, "authenticated", owner, (c) => c.query("delete from public.site_pages where slug = 'privacy'")));
  });

  it("only the three known pages exist, and blank text is refused", async () => {
    await expectError(write(owner, "about", "Not a policy page"));
    await expectError(write(owner, "refunds", "   "));
  });

  it("every change is in the audit log with the editor's identity", async () => {
    const { rows } = await db.pool.query(
      "select action, actor_user_id from public.audit_log where entity_type = 'site_pages' and entity_id = 'privacy' order by id");
    expect(rows).toEqual([
      { action: "insert", actor_user_id: owner },
      { action: "update", actor_user_id: admin },
    ]);
  });
});
