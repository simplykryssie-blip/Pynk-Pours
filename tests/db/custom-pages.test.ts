/**
 * Custom pages: visitors read published pages only; MFA-verified owners/admins
 * create, edit, hide and delete; every change is audited.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createStaff, createTestDb, expectError, type TestDb } from "./helpers";

let db: TestDb;
let owner: string, admin: string, checkin: string;

beforeAll(async () => {
  db = await createTestDb("custom_pages");
  owner = await createStaff(db, "owner");
  admin = await createStaff(db, "admin");
  checkin = await createStaff(db, "checkin");
});
afterAll(async () => db?.close());

const create = (user: string, slug: string, published: boolean, opts?: { aal?: "aal1" | "aal2" }) =>
  as(db, "authenticated", user, (c) => c.query(
    "insert into public.custom_pages (slug, title, body, published, updated_by) values ($1, 'Page', 'Body text.', $2, $3) returning id",
    [slug, published, user]), opts);

describe("custom pages", () => {
  it("visitors see published pages only; admins also see drafts", async () => {
    await create(owner, "code-of-conduct", true);
    await create(admin, "photo-policy", false);
    const anon = await as(db, "anon", null, (c) => c.query("select slug from public.custom_pages order by slug"));
    expect(anon.rows).toEqual([{ slug: "code-of-conduct" }]);
    const staff = await as(db, "authenticated", admin, (c) => c.query("select slug from public.custom_pages order by slug"));
    expect(staff.rows.map((r) => r.slug)).toEqual(["code-of-conduct", "photo-policy"]);
    const door = await as(db, "authenticated", checkin, (c) => c.query("select slug from public.custom_pages order by slug"));
    expect(door.rows).toEqual([{ slug: "code-of-conduct" }]);
  });

  it("only MFA-verified owners/admins can write, attributed to themselves", async () => {
    await expectError(as(db, "anon", null, (c) => c.query(
      "insert into public.custom_pages (slug, title, body) values ('x-page', 'X', 'x')")));
    await expectError(create(checkin, "door-page", true));
    await expectError(create(owner, "no-mfa", true, { aal: "aal1" }));
    await expectError(as(db, "authenticated", admin, (c) => c.query(
      "update public.custom_pages set body = 'spoof', updated_by = $1 where slug = 'code-of-conduct'", [owner])));
    const hijack = await as(db, "authenticated", checkin, (c) => c.query("delete from public.custom_pages where slug = 'code-of-conduct'"));
    expect(hijack.rowCount).toBe(0);
  });

  it("addresses must be lowercase words and dashes, and unique", async () => {
    for (const bad of ["Bad Slug", "UPPER", "a", "-lead", "trail-", "double--dash", "../etc"]) await expectError(create(owner, bad, false));
    await expectError(create(owner, "code-of-conduct", false));
  });

  it("an admin can hide and delete a page; every change is audited", async () => {
    await as(db, "authenticated", admin, (c) => c.query(
      "update public.custom_pages set published = false, updated_by = $1 where slug = 'code-of-conduct'", [admin]));
    expect((await as(db, "anon", null, (c) => c.query("select 1 from public.custom_pages"))).rowCount).toBe(0);
    const { rows: [{ id }] } = await db.pool.query("select id from public.custom_pages where slug = 'code-of-conduct'");
    await as(db, "authenticated", owner, (c) => c.query("delete from public.custom_pages where id = $1", [id]));
    const { rows } = await db.pool.query(
      "select action, actor_user_id from public.audit_log where entity_type = 'custom_pages' and entity_id = $1 order by id", [id]);
    expect(rows).toEqual([
      { action: "insert", actor_user_id: owner },
      { action: "update", actor_user_id: admin },
      { action: "delete", actor_user_id: owner },
    ]);
  });
});
