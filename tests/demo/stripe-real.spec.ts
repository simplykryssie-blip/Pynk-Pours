/**
 * REAL Stripe TEST-MODE walkthrough (hosted Checkout + official test cards).
 * Run via scripts/stripe/real-test-demo.sh only. Skipped otherwise.
 * NOTE: Stripe's hosted-page selectors below are best-effort and must be
 * confirmed on the first real run (Stripe changes its UI over time).
 */
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import Stripe from "stripe";
import { asStaff } from "../e2e/admin-auth";
import { fillGuests, orderByBuyer, pickTickets, SLUG, tickets } from "../e2e/checkout-helpers";
import { localDb, resetRateLimits } from "../e2e/support";
import { shooter } from "./shot";

test.skip(process.env.STRIPE_REAL_DEMO !== "1", "Real Stripe demo: run scripts/stripe/real-test-demo.sh");
const shot = shooter("docs/qa/stage-d-real", "[STRIPE TEST MODE] ");

async function stripePay(page: Page, card: string) {
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
  await page.getByPlaceholder(/1234 1234 1234 1234/).fill(card);
  await page.getByPlaceholder(/MM \/ YY/).fill("12 / 34");
  await page.getByPlaceholder(/CVC/).fill("123");
  const name = page.getByPlaceholder(/full name on card|Full name on card/i).or(page.getByLabel(/Cardholder name/i));
  if (await name.first().isVisible().catch(() => false)) await name.first().fill("Test Guest");
  const zip = page.getByPlaceholder(/ZIP/i);
  if (await zip.isVisible().catch(() => false)) await zip.fill("70601");
  await page.getByRole("button", { name: /^Pay/ }).click();
}

test("PynkPours checkout with real Stripe test mode", async ({ page, browser }) => {
  test.setTimeout(600_000);
  await resetRateLimits();
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

  // Success (4242) with multiple guests
  const a = randomUUID().slice(0, 6);
  await pickTickets(page, { "Sample General Admission": 2, "Sample VIP": 1 });
  await fillGuests(page, a);
  await page.getByRole("button", { name: "Continue to secure payment" }).click();
  await shot(page, "Stripe hosted Checkout (test mode)");
  await stripePay(page, "4242 4242 4242 4242");
  await expect(page.getByRole("heading", { name: "You're registered!" })).toBeVisible({ timeout: 60_000 });
  await shot(page, "Paid with 4242 — tickets issued after Stripe's signed webhook", { fullPage: true });

  // Table purchase
  const t = randomUUID().slice(0, 6);
  await pickTickets(page, { "Sample General Admission": 0, "Sample Table for 4": 1 });
  await fillGuests(page, t);
  await page.getByRole("button", { name: "Continue to secure payment" }).click();
  await stripePay(page, "4242 4242 4242 4242");
  await expect(page.getByTestId("ticket")).toHaveCount(4, { timeout: 60_000 });
  await shot(page, "Table for 4 — four individual tickets", { fullPage: true });

  // Declined card
  const d = randomUUID().slice(0, 6);
  await pickTickets(page, { "Sample General Admission": 1 });
  await fillGuests(page, d);
  await page.getByRole("button", { name: "Continue to secure payment" }).click();
  await stripePay(page, "4000 0000 0000 0002");
  await expect(page.getByText(/declined/i).first()).toBeVisible({ timeout: 30_000 });
  await shot(page, "Declined card 4000 0000 0000 0002 — no charge, no tickets");
  expect((await orderByBuyer(d)).status).toBe("pending");

  // Abandoned + expired
  const ex = randomUUID().slice(0, 6);
  await pickTickets(page, { "Sample General Admission": 2 });
  await fillGuests(page, ex);
  await page.getByRole("button", { name: "Continue to secure payment" }).click();
  await page.waitForURL(/checkout\.stripe\.com/);
  const exo = await orderByBuyer(ex);
  await stripe.checkout.sessions.expire(exo.stripe_checkout_session_id);
  await expect.poll(async () => (await orderByBuyer(ex)).status, { timeout: 60_000 }).toBe("cancelled");
  await page.reload();
  await shot(page, "Session expired in Stripe → webhook released the held seats");

  // Duplicate webhook: re-deliver Stripe's genuine event payload, re-signed with the CLI secret
  const paid = await orderByBuyer(a);
  const evts = await stripe.events.list({ type: "checkout.session.completed", limit: 20 });
  const evt = evts.data.find((e) => (e.data.object as Stripe.Checkout.Session).id === paid.stripe_checkout_session_id)!;
  const payload = JSON.stringify(evt);
  const results = await Promise.all(Array.from({ length: 5 }, async () => {
    const sig = Stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET! });
    const r = await fetch("http://localhost:3123/api/stripe/webhook", { method: "POST", headers: { "Content-Type": "application/json", "Stripe-Signature": sig }, body: payload });
    return (await r.json()).status;
  }));
  expect(results).toEqual(["duplicate", "duplicate", "duplicate", "duplicate", "duplicate"]);
  expect(await tickets(paid.id)).toHaveLength(3);

  // Refund one ticket from the admin → Stripe refund → invalid at check-in
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const admin = await ctx.newPage();
  await asStaff(admin, "owner");
  const [t1] = await tickets(paid.id);
  await admin.goto(`/admin/registrations/${paid.id}`);
  await admin.getByRole("checkbox", { name: new RegExp(t1.manual_code) }).check();
  admin.once("dialog", (dlg) => dlg.accept());
  await admin.getByRole("button", { name: /Refund selected/ }).click();
  await expect(admin.getByText(/Refunded \$\d+\.\d\d for 1 ticket/)).toBeVisible({ timeout: 30_000 });
  await shot(admin, "Refund issued in Stripe test mode and recorded", { fullPage: true });
  const r = await localDb(async (c) => (await c.query("select status from public.tickets where id = $1", [t1.id])).rows[0].status);
  expect(r).toBe("refunded");
  await admin.goto(`/admin/check-in/${(await localDb(async (c) => (await c.query("select id from public.events where slug = $1", [SLUG])).rows[0].id))}?q=${t1.manual_code}`);
  await shot(admin, "Check-in: refunded ticket cannot be checked in");
  await ctx.close();
});
