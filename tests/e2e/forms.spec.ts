import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { humanPause, localDb, resetRateLimits } from "./support";

test.beforeEach(async () => {
  await resetRateLimits();
});

const unique = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}@example.test`;

test("contact form: validation messages next to fields", async ({ page }) => {
  await page.goto("/contact");
  await humanPause(page);
  await page.getByRole("main").getByLabel("Email address").fill("not-an-email");
  await page.getByRole("button", { name: "Send message" }).click();
  const form = page.getByRole("main").locator("form");
  await expect(form.getByRole("alert")).toContainText("Please fix the highlighted fields");
  await expect(page.getByRole("main").getByLabel("Full name")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await expect(page.getByText(/at least 10 characters/)).toBeVisible();
  // Input is preserved after an error.
  await expect(page.getByRole("main").getByLabel("Email address")).toHaveValue("not-an-email");
});

test("contact form: valid submission is stored", async ({ page }) => {
  const email = unique("contact");
  await page.goto("/contact");
  await page.getByRole("main").getByLabel("Full name").fill("E2E Tester");
  await page.getByRole("main").getByLabel("Email address").fill(email.toUpperCase());
  await page.getByRole("main").getByLabel("Topic").selectOption("event");
  await page.getByRole("main").getByLabel("Your message").fill("Hello from the end-to-end test suite.");
  await humanPause(page);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("status")).toContainText("Thank you");
  const rows = await localDb(async (c) => (await c.query("select name, topic, email from public.contact_submissions where email = $1", [email])).rows);
  expect(rows).toEqual([{ name: "E2E Tester", topic: "event", email }]);
});

test("contact form: bots (honeypot / too fast) are silently dropped", async ({ page }) => {
  const email = unique("bot");
  await page.goto("/contact");
  await page.getByRole("main").getByLabel("Full name").fill("Bot");
  await page.getByRole("main").getByLabel("Email address").fill(email);
  await page.getByRole("main").getByLabel("Your message").fill("Buy cheap things now, great deals!");
  // Submit immediately (faster than a human) — looks like success, nothing stored.
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("status")).toContainText("Thank you");
  const n = await localDb(async (c) => (await c.query("select count(*)::int n from public.contact_submissions where email = $1", [email])).rows[0].n);
  expect(n).toBe(0);
});

test("contact form: rate limited after 5 submissions", async ({ page }) => {
  for (let i = 0; i < 6; i++) {
    await page.goto("/contact");
    await page.getByRole("main").getByLabel("Full name").fill("Rate Tester");
    await page.getByRole("main").getByLabel("Email address").fill(unique("rate"));
    await page.getByRole("main").getByLabel("Your message").fill("Checking the rate limit behaviour.");
    await humanPause(page);
    await page.getByRole("button", { name: "Send message" }).click();
    if (i < 5) await expect(page.getByRole("status")).toContainText("Thank you");
    else await expect(page.getByRole("main").locator("form").getByRole("alert")).toContainText("Too many attempts");
  }
});

test("partners page: inquiry form defaults to partnership", async ({ page }) => {
  const email = unique("partner");
  await page.goto("/partners");
  await page.getByRole("link", { name: /become a partner/i }).click();
  await expect(page).toHaveURL(/#inquiry$/);
  await expect(page.getByRole("main").getByLabel("Topic")).toHaveValue("partnership");
  await page.getByRole("main").getByLabel("Full name").fill("Partner Org");
  await page.getByRole("main").getByLabel("Email address").fill(email);
  await page.getByRole("main").getByLabel("Your message").fill("We would love to sponsor an upcoming event.");
  await humanPause(page);
  await page.getByRole("button", { name: "Send inquiry" }).click();
  await expect(page.getByRole("status")).toContainText("Thank you");
  const topic = await localDb(async (c) => (await c.query("select topic from public.contact_submissions where email = $1", [email])).rows[0]?.topic);
  expect(topic).toBe("partnership");
});

test("newsletter sign-up (home) stores the subscriber once", async ({ page }) => {
  const email = unique("news");
  for (let i = 0; i < 2; i++) {
    await page.goto("/");
    const section = page.locator("#newsletter");
    await section.getByLabel("Email address").fill(email);
    await humanPause(page);
    await section.getByRole("button", { name: /join the pynkpours list/i }).click();
    await expect(section.getByRole("status")).toContainText("You're on the list");
  }
  const rows = await localDb(async (c) => (await c.query("select source from public.newsletter_subscribers where email = $1", [email])).rows);
  expect(rows).toEqual([{ source: "home" }]);
});

test("newsletter rejects an invalid email", async ({ page }) => {
  await page.goto("/");
  const section = page.locator("#newsletter");
  await section.getByLabel("Email address").fill("nope");
  await humanPause(page);
  await section.getByRole("button", { name: /join the pynkpours list/i }).click();
  await expect(section.getByText("Enter a valid email address.")).toBeVisible();
});

test("get-notified sign-up for the coming-soon brunch", async ({ page }) => {
  const email = unique("notify");
  await page.goto("/events/entrepreneurial-brunch");
  const aside = page.getByRole("complementary", { name: "Registration" });
  await aside.getByLabel("Name (optional)").fill("Interested Guest");
  await aside.getByLabel("Email address").fill(email);
  await humanPause(page);
  await aside.getByRole("button", { name: "Get notified" }).click();
  await expect(aside.getByRole("status")).toContainText("as soon as details are announced");
  const rows = await localDb(async (c) => (await c.query(
    "select i.kind, i.name from public.event_interest i join public.events e on e.id = i.event_id where e.slug = 'entrepreneurial-brunch' and i.email = $1", [email])).rows);
  expect(rows).toEqual([{ kind: "notify", name: "Interested Guest" }]);
});

test("waitlist sign-up for a sold-out event", async ({ page }) => {
  const email = unique("wait");
  await page.goto("/events/sample-sold-out-workshop");
  const aside = page.getByRole("complementary", { name: "Registration" });
  await aside.getByLabel("Email address").fill(email);
  await humanPause(page);
  await aside.getByRole("button", { name: "Join the waitlist" }).click();
  await expect(aside.getByRole("status")).toContainText("waitlist");
  const kind = await localDb(async (c) => (await c.query("select kind from public.event_interest where email = $1", [email])).rows[0]?.kind);
  expect(kind).toBe("waitlist");
});
