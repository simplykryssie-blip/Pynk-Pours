import { expect, test } from "@playwright/test";

test("events list shows published upcoming events only", async ({ page }) => {
  await page.goto("/events");
  const list = page.getByRole("main");
  await expect(list.getByRole("heading", { name: /SAMPLE Networking Social/ })).toBeVisible();
  await expect(list.getByRole("heading", { name: "The Entrepreneurial Brunch" })).toBeVisible();
  await expect(list.getByRole("heading", { name: /SAMPLE Sold-Out Workshop/ })).toBeVisible();
  await expect(page.getByText(/SAMPLE DRAFT/)).toHaveCount(0);
  await expect(page.getByText(/SAMPLE Past Gathering/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Upcoming events" })).toHaveAttribute("aria-current", "page");
});

test("past events tab", async ({ page }) => {
  await page.goto("/events");
  await page.getByRole("link", { name: "Past events" }).click();
  await expect(page).toHaveURL(/view=past/);
  await expect(page.getByRole("heading", { name: /SAMPLE Past Gathering/ })).toBeVisible();
  await expect(page.getByText(/SAMPLE Networking Social/)).toHaveCount(0);
});

test("event card links to its event page", async ({ page }) => {
  await page.goto("/events");
  await page.getByRole("link", { name: /SAMPLE Networking Social/ }).first().click();
  await expect(page).toHaveURL(/\/events\/sample-networking-social/);
});

test("on-sale event: event-timezone times, tiers, optional VIP, notify sign-up", async ({ page }) => {
  await page.goto("/events/sample-networking-social");
  // Times are shown in the event's timezone with the zone abbreviation.
  await expect(page.getByRole("complementary", { name: "Registration" })).toContainText(/(CST|CDT)/);
  const tickets = page.locator("#tickets");
  await expect(tickets.getByRole("heading", { name: "Sample General Admission" })).toBeVisible();
  await expect(tickets.getByRole("heading", { name: "Sample VIP" })).toBeVisible();
  await expect(tickets).toContainText("$25.00");
  await expect(tickets).toContainText("$60.00");
  await expect(page.getByRole("complementary", { name: "Registration" })).toContainText("From $25.00");
  await expect(page.getByRole("button", { name: /notify me when registration opens/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /add to calendar/i })).toHaveAttribute("href", /\/calendar$/);
  // Agenda, FAQ and details render from the database.
  await expect(page.getByRole("heading", { name: "Schedule" })).toBeVisible();
  await page.getByText("Is this a real event?").click();
  await expect(page.getByText("No. This is sample data for development.")).toBeVisible();
  await expect(page.getByText("21+ (valid ID may be required)")).toBeVisible();
});

test("coming-soon Entrepreneurial Brunch: no invented details", async ({ page }) => {
  await page.goto("/events/entrepreneurial-brunch");
  const aside = page.getByRole("complementary", { name: "Registration" });
  await expect(aside).toContainText("Date to be announced");
  await expect(aside).toContainText("Venue to be announced");
  await expect(aside.getByRole("button", { name: "Get notified" })).toBeVisible();
  await expect(page.getByRole("link", { name: /add to calendar/i })).toHaveCount(0);
  await expect(page.locator("#tickets")).toHaveCount(0);
  await expect(page.getByText(/\$\d/)).toHaveCount(0); // no prices anywhere
});

test("sold-out event with waitlist offers the waitlist", async ({ page }) => {
  await page.goto("/events/sample-sold-out-workshop");
  await expect(page.getByRole("button", { name: "Join the waitlist" })).toBeVisible();
  await expect(page.locator("#tickets")).toContainText("Sold out");
});

test("past event is not purchasable", async ({ page }) => {
  await page.goto("/events/sample-past-gathering");
  await expect(page.getByText("This event has ended")).toBeVisible();
  await expect(page.getByRole("button", { name: /notify|waitlist|ticket/i })).toHaveCount(0);
});

test("draft and unknown events show the not-found page without leaking content", async ({ page }) => {
  for (const slug of ["sample-draft-hidden", "does-not-exist"]) {
    await page.goto(`/events/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/run dry/i);
    await expect(page.getByText(/must not be public/)).toHaveCount(0);
    expect(await page.locator('meta[name="robots"]').first().getAttribute("content")).toContain("noindex");
  }
});

test("home features the Entrepreneurial Brunch from the database", async ({ page }) => {
  await page.goto("/");
  const featured = page.locator("section[aria-labelledby='featured-heading']");
  await expect(featured.getByRole("heading", { name: "The Entrepreneurial Brunch" })).toBeVisible();
  // Wait for the database-backed feature to stream in (the static teaser is the fallback).
  const cta = featured.getByRole("link", { name: /get event updates/i });
  await expect(cta).toHaveAttribute("href", "/events/entrepreneurial-brunch");
  await cta.click();
  await expect(page).toHaveURL(/\/events\/entrepreneurial-brunch$/);
});

test("experiences page links to the permanent brunch page", async ({ page }) => {
  await page.goto("/experiences");
  await page.getByRole("link", { name: /get event updates/i }).click();
  await expect(page).toHaveURL(/\/events\/entrepreneurial-brunch$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("The Entrepreneurial Brunch");
});

test("calendar file downloads for dated events only", async ({ request }) => {
  const ok = await request.get("/events/sample-networking-social/calendar");
  expect(ok.status()).toBe(200);
  expect(ok.headers()["content-type"]).toContain("text/calendar");
  expect(await ok.text()).toContain("BEGIN:VEVENT");
  expect((await request.get("/events/entrepreneurial-brunch/calendar")).status()).toBe(404);
  expect((await request.get("/events/sample-draft-hidden/calendar")).status()).toBe(404);
});
