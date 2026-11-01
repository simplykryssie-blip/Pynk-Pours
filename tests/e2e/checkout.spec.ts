/**
 * Stage D guest checkout, end to end, in a real browser, against the LOCAL
 * Supabase stack and the LOCAL STRIPE TEST DOUBLE (tests/support/stripe-double.mts,
 * clearly labelled "not Stripe"). Payment confirmation and tickets come ONLY
 * from signed webhooks to /api/stripe/webhook. The real-Stripe demonstration
 * with test cards runs once Stripe network access + test keys are configured.
 */
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import Stripe from "stripe";
import { asStaff } from "./admin-auth";
import { fillGuests, orderByBuyer, payWith, pickTickets, SLUG, tickets, tierId } from "./checkout-helpers";
import { localDb, resetRateLimits } from "./support";

process.loadEnvFile(".env.local");
const DOUBLE = "http://127.0.0.1:12111";

test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "checkout flows run once (desktop); phone layout covered separately");
test.beforeEach(async () => { await resetRateLimits(); });

test("multiple tickets, different guests: pay with 4242 → tickets only after the signed webhook", async ({ page }) => {
  const tag = randomUUID().slice(0, 8);
  await pickTickets(page, { "Sample General Admission": 2, "Sample VIP": 1 });
  await expect(page.getByTestId("order-total")).toHaveText("$110.00");
  expect(await fillGuests(page, tag)).toBe(3);
  await page.getByRole("button", { name: "Continue to secure payment" }).click();
  await expect(page).toHaveURL(new RegExp(`^${DOUBLE}/pay/cs_test_`));
  const pending = await orderByBuyer(tag);
  expect(pending).toMatchObject({ status: "pending", total_cents: 11000 });
  expect(await tickets(pending.id)).toHaveLength(0); // nothing issued before payment
  await payWith(page, "4242 4242 4242 4242");
  await expect(page).toHaveURL(/\/orders\/[A-Za-z0-9_-]{43}\?from=checkout$/);
  await expect(page.getByRole("heading", { name: "You're registered!" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("ticket")).toHaveCount(3);
  await expect(page.getByText(`Guest 2 ${tag}`)).toBeVisible();
  const paid = await orderByBuyer(tag);
  expect(paid.status).toBe("paid");
  expect(await tickets(paid.id)).toHaveLength(3);
  const holds = await localDb(async (c) => (await c.query("select status from public.inventory_holds where order_id = $1", [paid.id])).rows);
  expect(holds.every((h) => h.status === "converted")).toBe(true);
});

test("table purchase: one table → four guests → four individual tickets", async ({ page }) => {
  const tag = randomUUID().slice(0, 8);
  await pickTickets(page, { "Sample General Admission": 0, "Sample Table for 4": 1 });
  expect(await fillGuests(page, tag)).toBe(4);
  await expect(page.getByText("Sample Table for 4 — guest 4 of 4")).toBeVisible();
  await page.getByRole("button", { name: "Continue to secure payment" }).click();
  await payWith(page, "4242424242424242");
  await expect(page.getByRole("heading", { name: "You're registered!" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("ticket")).toHaveCount(4);
  const o = await orderByBuyer(tag);
  const tk = await tickets(o.id);
  expect(tk).toHaveLength(4);
  expect(new Set(tk.map((t) => t.manual_code)).size).toBe(4);
});

test("declined card (4000 0000 0000 0002): no payment, no tickets, seats still held; retry succeeds", async ({ page }) => {
  const tag = randomUUID().slice(0, 8);
  await pickTickets(page, { "Sample General Admission": 1 });
  await fillGuests(page, tag);
  await page.getByRole("button", { name: "Continue to secure payment" }).click();
  await payWith(page, "4000 0000 0000 0002");
  await expect(page.getByRole("alert")).toHaveText("Your card was declined.");
  const o = await orderByBuyer(tag);
  await page.waitForTimeout(1000); // let the payment_failed webhook land
  expect(o.status).toBe("pending");
  expect(await tickets(o.id)).toHaveLength(0);
  const evt = await localDb(async (c) => (await c.query("select outcome from public.stripe_events where type = 'payment_intent.payment_failed' order by received_at desc limit 1")).rows[0]);
  expect(evt.outcome).toBe("payment_failed_logged");
  await payWith(page, "4242 4242 4242 4242");
  await expect(page.getByRole("heading", { name: "You're registered!" })).toBeVisible({ timeout: 20_000 });
});

test("abandoned checkout: guest leaves Stripe, cancels, seats return to sale", async ({ page }) => {
  const tag = randomUUID().slice(0, 8);
  const vip = await tierId("Sample VIP");
  const left = () => localDb(async (c) => (await c.query("select public._ticket_type_remaining_units($1) n", [vip])).rows[0].n as number);
  const before = await left();
  await pickTickets(page, { "Sample General Admission": 0, "Sample VIP": 2 });
  await fillGuests(page, tag);
  await page.getByRole("button", { name: "Continue to secure payment" }).click();
  await expect(page.getByText("LOCAL STRIPE TEST DOUBLE")).toBeVisible();
  expect(await left()).toBe(before - 2); // held while paying
  await page.getByRole("link", { name: "← Back" }).click();
  await expect(page.getByRole("heading", { name: "You left the payment page." })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Cancel order" }).click();
  await expect(page.getByRole("heading", { name: "This order was cancelled." })).toBeVisible();
  expect((await orderByBuyer(tag)).status).toBe("cancelled");
  expect(await left()).toBe(before);
  // The Stripe session was expired too, so it can't be paid later.
  const o = await orderByBuyer(tag);
  await page.goto(`${DOUBLE}/pay/${o.stripe_checkout_session_id}`);
  await expect(page.getByRole("alert")).toHaveText("This checkout session has expired.");
});

test("expired inventory hold: Stripe session expiry webhook releases seats; stale holds stop counting even before the sweep", async ({ page }) => {
  const tag = randomUUID().slice(0, 8);
  const ga = await tierId("Sample General Admission");
  const left = () => localDb(async (c) => (await c.query("select public._ticket_type_remaining_units($1) n", [ga])).rows[0].n as number);
  const before = await left();
  await pickTickets(page, { "Sample General Admission": 3 });
  await fillGuests(page, tag);
  await page.getByRole("button", { name: "Continue to secure payment" }).click();
  await expect(page.getByText("LOCAL STRIPE TEST DOUBLE")).toBeVisible();
  expect(await left()).toBe(before - 3);

  // (a) Time passes: the hold's clock runs out. Availability recovers immediately (lazy expiry)…
  const o = await orderByBuyer(tag);
  await localDb((c) => c.query("update public.inventory_holds set expires_at = now() - interval '1 minute' where order_id = $1", [o.id]));
  expect(await left()).toBe(before);
  // (b) …and Stripe's checkout.session.expired webhook (30-minute session timeout) cancels the order.
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { host: "127.0.0.1", port: 12111, protocol: "http" });
  await stripe.checkout.sessions.expire(o.stripe_checkout_session_id); // same event Stripe sends at timeout
  await expect.poll(async () => (await orderByBuyer(tag)).status, { timeout: 15_000 }).toBe("cancelled");
  const holds = await localDb(async (c) => (await c.query("select status from public.inventory_holds where order_id = $1", [o.id])).rows);
  expect(holds.every((h) => h.status === "released")).toBe(true);
  await page.reload();
  await expect(page.getByRole("alert")).toHaveText("This checkout session has expired.");
});

test("duplicate webhook delivery: the same signed event 5× concurrently creates nothing new", async ({ page, request }) => {
  const tag = randomUUID().slice(0, 8);
  await pickTickets(page, { "Sample General Admission": 2 });
  await fillGuests(page, tag);
  await page.getByRole("button", { name: "Continue to secure payment" }).click();
  await payWith(page, "4242 4242 4242 4242");
  await expect(page.getByRole("heading", { name: "You're registered!" })).toBeVisible({ timeout: 20_000 });
  const o = await orderByBuyer(tag);
  const events = await (await request.get(`${DOUBLE}/__test/events`)).json() as { id: string; type: string; object: { id: string } }[];
  const completed = events.find((e) => e.type === "checkout.session.completed" && e.object.id === o.stripe_checkout_session_id)!;
  const r = await (await request.post(`${DOUBLE}/__test/redeliver/${completed.id}?times=5`)).json() as { results: { status: number; body: string }[] };
  expect(r.results.map((x) => x.status)).toEqual([200, 200, 200, 200, 200]);
  expect(r.results.every((x) => JSON.parse(x.body).status === "duplicate")).toBe(true);
  expect(await tickets(o.id)).toHaveLength(2);
  const emails = await localDb(async (c) => (await c.query("select count(*)::int n from public.email_messages where order_id = $1", [o.id])).rows[0].n);
  expect(emails).toBe(3);
  const orders = await localDb(async (c) => (await c.query("select count(*)::int n from public.orders where purchaser_email = $1", [`buyer-${tag}@example.test`])).rows[0].n);
  expect(orders).toBe(1);
});

test("webhook endpoint rejects unsigned or forged requests", async ({ request }) => {
  const body = JSON.stringify({ id: "evt_forged", type: "checkout.session.completed", livemode: false, data: { object: {} } });
  expect((await request.post("/api/stripe/webhook", { data: body, headers: { "Content-Type": "application/json" } })).status()).toBe(400);
  const forged = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: "whsec_attacker_guess" });
  expect((await request.post("/api/stripe/webhook", { data: body, headers: { "Content-Type": "application/json", "Stripe-Signature": forged } })).status()).toBe(400);
  const stale = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: process.env.STRIPE_WEBHOOK_SECRET!, timestamp: Math.floor(Date.now() / 1000) - 3600 });
  expect((await request.post("/api/stripe/webhook", { data: body, headers: { "Content-Type": "application/json", "Stripe-Signature": stale } })).status()).toBe(400);
  const n = await localDb(async (c) => (await c.query("select count(*)::int n from public.stripe_events where id = 'evt_forged'")).rows[0].n);
  expect(n).toBe(0);
});

test("a returning browser is not proof of payment: success URL alone shows 'confirming', no tickets", async ({ page }) => {
  const tag = randomUUID().slice(0, 8);
  await pickTickets(page, { "Sample General Admission": 1 });
  await fillGuests(page, tag);
  await page.getByRole("button", { name: "Continue to secure payment" }).click();
  await expect(page.getByText("LOCAL STRIPE TEST DOUBLE")).toBeVisible();
  // Jump straight to the success URL without paying.
  const cancelHref = await page.getByRole("link", { name: "← Back" }).getAttribute("href");
  await page.goto(cancelHref!.replace("?cancelled=1", "?from=checkout"));
  await expect(page.getByRole("heading", { name: "Confirming your payment…" })).toBeVisible();
  const o = await orderByBuyer(tag);
  expect(o.status).toBe("pending");
  expect(await tickets(o.id)).toHaveLength(0);
});

test("refunds: admin refunds one ticket via Stripe → that ticket can't be checked in; dashboard refund reconciles the rest", async ({ page, browser, request }) => {
  const tag = randomUUID().slice(0, 8);
  await pickTickets(page, { "Sample General Admission": 2 });
  await fillGuests(page, tag);
  await page.getByRole("button", { name: "Continue to secure payment" }).click();
  await payWith(page, "4242 4242 4242 4242");
  await expect(page.getByRole("heading", { name: "You're registered!" })).toBeVisible({ timeout: 20_000 });
  const o = await orderByBuyer(tag);
  const [t1] = await tickets(o.id);

  const ctx = await browser.newContext();
  const admin = await ctx.newPage();
  await asStaff(admin, "owner");
  await admin.goto(`/admin/registrations/${o.id}`);
  await admin.getByRole("checkbox", { name: new RegExp(t1.manual_code) }).check();
  await admin.getByLabel("Reason (internal)").fill("Guest can't attend");
  admin.once("dialog", (d) => d.accept());
  await admin.getByRole("button", { name: /Refund selected \(\$25\.00\)/ }).click();
  await expect(admin.getByText(/Refunded \$25\.00 for 1 ticket/)).toBeVisible();
  expect((await orderByBuyer(tag)).status).toBe("partially_refunded");

  // The charge.refunded webhook for this refund arrives and is a no-op (already recorded).
  await expect.poll(async () => (await localDb(async (c) => (await c.query(
    "select outcome from public.stripe_events where type = 'charge.refunded' order by received_at desc limit 1")).rows[0]))?.outcome, { timeout: 10_000 }).toBe("refunds_reconciled:0");

  // Check-in staff: the refunded ticket shows "refunded" and has no check-in button.
  const door = await ctx.newPage();
  await door.context().clearCookies();
  await asStaff(door, "checkin");
  const eventId = await localDb(async (c) => (await c.query("select id from public.events where slug = $1", [SLUG])).rows[0].id);
  await door.goto(`/admin/check-in/${eventId}?q=${t1.manual_code}`);
  const row = door.getByRole("main").locator("li", { hasText: t1.manual_code });
  await expect(row).toContainText("refunded");
  await expect(row.getByRole("button", { name: "Check in" })).toHaveCount(0);
  const scan = await localDb(async (c) => {
    await c.query("begin");
    const uid = (await c.query("select id from auth.users where email = 'door@pynkpours.test'")).rows[0].id;
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: "authenticated", aal: "aal2" })]);
    await c.query("set local role authenticated");
    const r = (await c.query("select public.check_in_by_ticket($1, $2) r", [eventId, t1.id])).rows[0].r;
    await c.query("rollback");
    return r;
  });
  expect(scan.result).toBe("refunded");

  // Refund the remainder from the Stripe dashboard (simulated): reconciled automatically.
  await request.post(`${DOUBLE}/__test/dashboard-refund`, { data: { payment_intent: o.stripe_payment_intent_id, amount: 2500 } });
  await expect.poll(async () => (await orderByBuyer(tag)).status, { timeout: 15_000 }).toBe("refunded");
  expect((await tickets(o.id)).every((t) => t.status === "refunded")).toBe(true);
  await ctx.close();
});

test("over-selection is refused server-side even with a crafted link", async ({ page }) => {
  const vip = await tierId("Sample VIP");
  await page.goto(`/events/${SLUG}/checkout?sel=${vip}:5`);
  await expect(page.getByText(/can be purchased right now/)).toBeVisible();
});

test("free registration: no Stripe redirect, tickets issued, inventory enforced, audited", async ({ page }) => {
  const slug = `sample-free-${randomUUID().slice(0, 6)}`;
  const tag = randomUUID().slice(0, 8);
  await localDb(async (c) => {
    const ev = (await c.query(`insert into public.events (slug, title, short_description, starts_at, ends_at, timezone, venue_name, registration_mode)
      values ($1, 'SAMPLE Free Mixer (not real)', 'SAMPLE', now() + interval '20 day', now() + interval '20 day 2 hour', 'America/Chicago', 'Sample', 'tickets') returning id`, [slug])).rows[0].id;
    await c.query("insert into public.ticket_types (event_id, name, price_cents, capacity) values ($1, 'Free RSVP', 0, 2)", [ev]);
    await c.query("update public.events set status = 'published' where id = $1", [ev]);
  });
  await page.goto(`/events/${slug}`);
  const group = page.getByRole("group", { name: "Quantity for Free RSVP" });
  await expect(group.locator("output")).toHaveText("1"); // single tier preselected
  await group.getByRole("button", { name: "More Free RSVP" }).click();
  await expect(group.getByRole("button", { name: "More Free RSVP" })).toBeDisabled(); // capacity 2
  await page.getByRole("link", { name: "Continue" }).click();
  const main = page.getByRole("main");
  await main.getByRole("textbox", { name: "Full name", exact: true }).fill(`Free ${tag}`);
  await main.getByRole("textbox", { name: "Email", exact: true }).fill(`buyer-${tag}@example.test`);
  for (let i = 0; i < 2; i++) {
    await page.getByTestId(`guest-${i}`).getByRole("textbox", { name: "Guest name" }).fill(`Free Guest ${i + 1}`);
    await page.getByTestId(`guest-${i}`).getByRole("textbox", { name: "Guest email" }).fill(`free${i}-${tag}@example.test`);
  }
  await page.getByText(/I've read the event details/).click();
  await page.waitForTimeout(2700);
  await page.getByRole("button", { name: "Complete registration" }).click();
  await expect(page).toHaveURL(/\/orders\/[A-Za-z0-9_-]{43}$/); // straight to the order — no payment page
  await expect(page.getByRole("heading", { name: "You're registered!" })).toBeVisible();
  await expect(page.getByTestId("ticket")).toHaveCount(2);
  const o = await orderByBuyer(tag);
  expect(o).toMatchObject({ status: "paid", total_cents: 0, stripe_checkout_session_id: null });
  const audit = await localDb(async (c) => (await c.query("select metadata from public.audit_log where action = 'order.paid' and entity_id = $1", [o.id])).rows);
  expect(audit).toEqual([{ metadata: { provider: "free", tickets: 2 } }]);
  await page.goto(`/events/${slug}`);
  await expect(page.getByRole("complementary", { name: "Registration" })).toContainText("Sold out");
});
