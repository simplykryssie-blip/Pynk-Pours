/** Shared guest-checkout steps for e2e tests and the recorded walkthrough. */
import { expect, type Page } from "@playwright/test";
import { localDb } from "./support";

export const SLUG = "sample-networking-social";

export const tierId = (name: string) => localDb(async (c) => (await c.query(
  "select t.id from public.ticket_types t join public.events e on e.id = t.event_id where e.slug = $1 and t.name = $2", [SLUG, name])).rows[0].id as string);

export async function pickTickets(page: Page, picks: Record<string, number>) {
  await page.goto(`/events/${SLUG}`);
  for (const [name, n] of Object.entries(picks)) {
    const group = page.getByRole("group", { name: `Quantity for ${name}` });
    const current = Number(await group.locator("output").textContent());
    for (let i = current; i < n; i++) await group.getByRole("button", { name: `More ${name}` }).click();
    for (let i = current; i > n; i--) await group.getByRole("button", { name: `Fewer ${name}` }).click();
  }
  await page.getByRole("link", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your registration" })).toBeVisible();
}

export async function fillGuests(page: Page, tag: string) {
  const main = page.getByRole("main");
  await main.getByRole("textbox", { name: "Full name", exact: true }).fill(`Buyer ${tag}`);
  await main.getByRole("textbox", { name: "Email", exact: true }).fill(`buyer-${tag}@example.test`);
  const blocks = page.locator("[data-testid^='guest-']");
  const n = await blocks.count();
  for (let i = 0; i < n; i++) {
    await blocks.nth(i).getByRole("textbox", { name: "Guest name" }).fill(`Guest ${i + 1} ${tag}`);
    await blocks.nth(i).getByRole("textbox", { name: "Guest email" }).fill(`guest${i + 1}-${tag}@example.test`);
  }
  if (await page.getByText(/I confirm every guest is/).isVisible()) await page.getByText(/I confirm every guest is/).click();
  await page.getByText(/I've read the event details/).click();
  await page.waitForTimeout(2700); // anti-bot minimum fill time
  return n;
}

export async function payWith(page: Page, card: string) {
  await expect(page.getByText("LOCAL STRIPE TEST DOUBLE")).toBeVisible();
  await page.getByLabel("Card number").fill(card);
  await page.getByLabel("Expiry").fill("12 / 34");
  await page.getByLabel("CVC").fill("123");
  await page.getByRole("button", { name: /^Pay \$/ }).click();
}

export const orderByBuyer = (tag: string) => localDb(async (c) => (await c.query(
  "select id, status, total_cents, stripe_checkout_session_id, stripe_payment_intent_id from public.orders where purchaser_email = $1", [`buyer-${tag}@example.test`])).rows[0]);
export const tickets = (orderId: string) => localDb(async (c) => (await c.query("select id, status, manual_code from public.tickets where order_id = $1 order by issued_at", [orderId])).rows);

