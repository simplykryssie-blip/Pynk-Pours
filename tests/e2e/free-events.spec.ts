/**
 * Free events while online payments are OFF (the production setting until
 * Stripe is approved). Runs against a second copy of the site started with
 * CHECKOUT_ENABLED=false (see playwright.config.ts). Free tickets must work;
 * paid tickets must stay unavailable, even if someone edits the page.
 */
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { localDb, resetRateLimits } from "./support";

const OFF = `http://localhost:${Number(process.env.E2E_PORT ?? 3123) + 1}`;
const tag = randomUUID().slice(0, 6);
const mixed = `sample-free-mixed-${tag}`;
const paidOnly = `sample-paid-only-${tag}`;
let paidTierId = "";

test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "runs once (desktop)");
test.beforeEach(async () => { await resetRateLimits(); });

test.beforeAll(async () => {
  await localDb(async (c) => {
    const mk = async (slug: string, title: string) => (await c.query(`insert into public.events (slug, title, short_description, starts_at, ends_at, timezone, venue_name, registration_mode)
      values ($1, $2, 'SAMPLE', now() + interval '12 day', now() + interval '12 day 2 hour', 'America/Chicago', 'Sample Venue', 'tickets') returning id`, [slug, title])).rows[0].id;
    const ev = await mk(mixed, "SAMPLE Free Community Night (not real)");
    await c.query("insert into public.ticket_types (event_id, name, price_cents, capacity, sort_order) values ($1, 'Free RSVP', 0, 50, 0)", [ev]);
    paidTierId = (await c.query("insert into public.ticket_types (event_id, name, price_cents, capacity, sort_order) values ($1, 'VIP Table', 5000, 10, 1) returning id", [ev])).rows[0].id;
    const ev2 = await mk(paidOnly, "SAMPLE Paid Dinner (not real)");
    await c.query("insert into public.ticket_types (event_id, name, price_cents, capacity) values ($1, 'Dinner', 7500, 20)", [ev2]);
    await c.query("update public.events set status = 'published' where slug in ($1, $2)", [mixed, paidOnly]);
  });
});

test("free tickets can be registered for while payments are off; paid ones stay hidden", async ({ page }) => {
  await page.goto(`${OFF}/events/${mixed}`);
  const panel = page.getByRole("complementary", { name: "Registration" });
  await expect(panel).toContainText("Register (free)");
  await expect(panel.getByRole("group", { name: "Quantity for Free RSVP" })).toBeVisible();
  await expect(panel.getByRole("group", { name: "Quantity for VIP Table" })).toHaveCount(0);
  await expect(panel).toContainText("Paid ticket options are opening soon.");
  await expect(panel).toContainText("it's free");
  await panel.getByRole("link", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your registration" })).toBeVisible();
  const main = page.getByRole("main");
  await main.getByRole("textbox", { name: "Full name", exact: true }).fill(`Free ${tag}`);
  await main.getByRole("textbox", { name: "Email", exact: true }).fill(`free-${tag}@example.test`);
  await page.getByTestId("guest-0").getByRole("textbox", { name: "Guest name" }).fill(`Guest ${tag}`);
  await page.getByTestId("guest-0").getByRole("textbox", { name: "Guest email" }).fill(`guest-${tag}@example.test`);
  await page.getByText(/I've read the event details/).click();
  await page.getByText("I confirm every guest is 18 or older and will bring valid ID.").click();
  await page.waitForTimeout(2700);
  await page.getByRole("button", { name: "Complete registration" }).click();
  await expect(page).toHaveURL(/\/orders\/[A-Za-z0-9_-]{43}$/);
  await expect(page.getByRole("heading", { name: "You're registered!" })).toBeVisible();
  await expect(page.getByTestId("ticket-qr")).toHaveCount(1);
});

test("a paid ticket can't be reached by link or by editing the page", async ({ page }) => {
  // By link:
  await page.goto(`${OFF}/events/${mixed}/checkout?sel=${paidTierId}:1`);
  await expect(page.getByText("Paid tickets aren't on sale online yet.")).toBeVisible();
  // By editing the free registration form to ask for the paid ticket instead:
  const freeId = await localDb(async (c) => (await c.query(
    "select t.id from public.ticket_types t join public.events e on e.id = t.event_id where e.slug = $1 and t.price_cents = 0", [mixed])).rows[0].id);
  await page.goto(`${OFF}/events/${mixed}/checkout?sel=${freeId}:1`);
  const main = page.getByRole("main");
  await main.getByRole("textbox", { name: "Full name", exact: true }).fill(`Sneaky ${tag}`);
  await main.getByRole("textbox", { name: "Email", exact: true }).fill(`sneaky-${tag}@example.test`);
  await page.getByTestId("guest-0").getByRole("textbox", { name: "Guest name" }).fill("Sneaky Guest");
  await page.getByTestId("guest-0").getByRole("textbox", { name: "Guest email" }).fill(`sneaky-guest-${tag}@example.test`);
  await page.getByText(/I've read the event details/).click();
  await page.getByText("I confirm every guest is 18 or older and will bring valid ID.").click();
  await page.evaluate((paid) => {
    const form = document.querySelector("form")!;
    (form.querySelector("input[name=sel]") as HTMLInputElement).value = JSON.stringify([{ ticket_type_id: paid, quantity: 1 }]);
    (form.querySelector("input[name=att_0_tt]") as HTMLInputElement).value = paid;
  }, paidTierId);
  await page.waitForTimeout(2700);
  await page.getByRole("button", { name: "Complete registration" }).click();
  await expect(page.getByText("Paid tickets aren't on sale online yet.")).toBeVisible();
  const orders = await localDb(async (c) => (await c.query("select count(*)::int n from public.orders where purchaser_email = $1", [`sneaky-${tag}@example.test`])).rows[0].n);
  expect(orders).toBe(0);
});

test("a paid-only event still collects 'notify me' sign-ups while payments are off", async ({ page }) => {
  await page.goto(`${OFF}/events/${paidOnly}`);
  const panel = page.getByRole("complementary", { name: "Registration" });
  await expect(panel).toContainText("Online registration is opening soon.");
  await expect(panel.getByRole("button", { name: "Notify me when registration opens" })).toBeVisible();
  await expect(panel.getByRole("link", { name: "Continue" })).toHaveCount(0);
});
