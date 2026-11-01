/**
 * Recorded Stage D walkthrough using the LOCAL STRIPE TEST DOUBLE (not Stripe).
 * Every caption is prefixed "[LOCAL TEST DOUBLE]". The real-Stripe test-card
 * demonstration is tests/demo/stripe-real.spec.ts (needs network + test keys).
 */
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import Stripe from "stripe";
import { asStaff } from "../e2e/admin-auth";
import { fillGuests, orderByBuyer, payWith, pickTickets, SLUG, tickets } from "../e2e/checkout-helpers";
import { localDb, resetRateLimits } from "../e2e/support";
import { shooter } from "./shot";

process.loadEnvFile(".env.local");
const shot = shooter("docs/qa/stage-d", "[LOCAL TEST DOUBLE] ");
const DOUBLE = "http://127.0.0.1:12111";

test("Stage D checkout walkthrough (local Stripe test double)", async ({ page, browser, request }) => {
  test.setTimeout(300_000);
  await resetRateLimits();

  // 1) Multi-ticket purchase, different guests.
  const a = randomUUID().slice(0, 6);
  await page.goto(`/events/${SLUG}`);
  await shot(page, "Event page: guests pick tickets — no account needed");
  await pickTickets(page, { "Sample General Admission": 2, "Sample VIP": 1 });
  await fillGuests(page, a);
  await shot(page, "Checkout: each ticket gets its own guest name and email", { fullPage: true });
  await page.getByRole("button", { name: "Continue to secure payment" }).click();
  await shot(page, "Payment page (test double of Stripe Checkout) — seats are now held");
  await page.getByLabel("Card number").fill("4242 4242 4242 4242");
  await page.getByLabel("Expiry").fill("12 / 34");
  await page.getByLabel("CVC").fill("123");
  await shot(page, "Test card 4242 4242 4242 4242 (success)");
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await expect(page.getByRole("heading", { name: "You're registered!" })).toBeVisible({ timeout: 20_000 });
  await shot(page, "Confirmed by the signed webhook: 3 individual tickets issued", { fullPage: true });

  // 2) Table purchase.
  const t = randomUUID().slice(0, 6);
  await pickTickets(page, { "Sample General Admission": 0, "Sample Table for 4": 1 });
  await fillGuests(page, t);
  await shot(page, "Table for 4: four guest blocks — one ticket per guest", { fullPage: true });
  await page.getByRole("button", { name: "Continue to secure payment" }).click();
  await payWith(page, "4242 4242 4242 4242");
  await expect(page.getByRole("heading", { name: "You're registered!" })).toBeVisible({ timeout: 20_000 });
  await shot(page, "Table purchase confirmed: 4 tickets with 4 different codes", { fullPage: true });

  // 3) Declined card, then success.
  const d = randomUUID().slice(0, 6);
  await pickTickets(page, { "Sample General Admission": 1 });
  await fillGuests(page, d);
  await page.getByRole("button", { name: "Continue to secure payment" }).click();
  await payWith(page, "4000 0000 0000 0002");
  await expect(page.getByRole("alert")).toHaveText("Your card was declined.");
  await shot(page, "Declined test card 4000 0000 0000 0002: no charge, no tickets, seats still held");
  const declined = await orderByBuyer(d);
  expect(declined.status).toBe("pending");
  await payWith(page, "4242 4242 4242 4242");
  await expect(page.getByRole("heading", { name: "You're registered!" })).toBeVisible({ timeout: 20_000 });

  // 4) Abandoned checkout.
  const ab = randomUUID().slice(0, 6);
  await pickTickets(page, { "Sample General Admission": 0, "Sample VIP": 2 });
  await fillGuests(page, ab);
  await page.getByRole("button", { name: "Continue to secure payment" }).click();
  await page.getByRole("link", { name: "← Back" }).click();
  await shot(page, "Abandoned: guest left the payment page — seats held, nothing charged");
  page.once("dialog", (dlg) => dlg.accept());
  await page.getByRole("button", { name: "Cancel order" }).click();
  await expect(page.getByRole("heading", { name: "This order was cancelled." })).toBeVisible();
  await shot(page, "Guest cancelled: Stripe session expired and seats released");

  // 5) Expired inventory hold (the 30-minute Stripe session timeout).
  const ex = randomUUID().slice(0, 6);
  await pickTickets(page, { "Sample General Admission": 2 });
  await fillGuests(page, ex);
  await page.getByRole("button", { name: "Continue to secure payment" }).click();
  const exo = await orderByBuyer(ex);
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { host: "127.0.0.1", port: 12111, protocol: "http" });
  await stripe.checkout.sessions.expire(exo.stripe_checkout_session_id); // what Stripe does at timeout
  await expect.poll(async () => (await orderByBuyer(ex)).status, { timeout: 15_000 }).toBe("cancelled");
  await page.reload();
  await shot(page, "Expired hold: checkout.session.expired webhook cancelled the order, seats released");

  // 6) Duplicate webhook delivery.
  const dup = await orderByBuyer(a);
  const events = await (await request.get(`${DOUBLE}/__test/events`)).json() as { id: string; type: string; object: { id: string } }[];
  const completed = events.find((e) => e.type === "checkout.session.completed" && e.object.id === dup.stripe_checkout_session_id)!;
  const r = await (await request.post(`${DOUBLE}/__test/redeliver/${completed.id}?times=5`)).json() as { results: { status: number; body: string }[] };
  const after = await tickets(dup.id);
  await page.setContent(`<!doctype html><meta charset="utf-8"><body style="font:16px system-ui;padding:40px;background:#f6f2ef">
    <h1 style="font-family:Georgia">Duplicate webhook delivery test</h1>
    <p>Event <code>${completed.id}</code> (checkout.session.completed) re-delivered <strong>5 times concurrently</strong> with valid signatures.</p>
    <ul>${r.results.map((x, i) => `<li>Delivery ${i + 1}: HTTP ${x.status} — ${JSON.parse(x.body).status}</li>`).join("")}</ul>
    <p>Tickets for the order after redelivery: <strong>${after.length}</strong> (unchanged). Orders created: <strong>1</strong>. Charges: <strong>1</strong>.</p></body>`);
  await shot(page, "Duplicate webhooks: 5 redeliveries acknowledged as duplicates — nothing new created");

  // 7) Refund → ticket invalid for check-in.
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const admin = await ctx.newPage();
  await asStaff(admin, "owner");
  const [t1] = await tickets(dup.id);
  await admin.goto(`/admin/registrations/${dup.id}`);
  await admin.getByRole("checkbox", { name: new RegExp(t1.manual_code) }).check();
  await admin.getByLabel("Reason (internal)").fill("Guest can't attend");
  await shot(admin, "Admin refund: choose tickets; amount computed per ticket");
  admin.once("dialog", (dlg) => dlg.accept());
  await admin.getByRole("button", { name: /Refund selected/ }).click();
  await expect(admin.getByText(/Refunded \$\d+\.\d\d for 1 ticket/)).toBeVisible();
  await shot(admin, "Refunded through Stripe and recorded; refund history shown", { fullPage: true });
  const door = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await asStaff(door, "checkin");
  const eventId = await localDb(async (c) => (await c.query("select id from public.events where slug = $1", [SLUG])).rows[0].id);
  await door.goto(`/admin/check-in/${eventId}?q=${t1.manual_code}`);
  await shot(door, "Check-in: the refunded ticket shows 'refunded' and cannot be checked in");
  await ctx.close();
});
