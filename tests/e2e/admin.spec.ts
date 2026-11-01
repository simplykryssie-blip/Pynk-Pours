/**
 * Stage C admin dashboard, end to end against the LOCAL Supabase stack:
 * real password + authenticator (TOTP) sign-in, role restrictions, event
 * lifecycle, ticket builder, media upload, preview, registrations, check-in,
 * staff management, audit log, mobile layout and accessibility.
 *
 * Data-changing flows run on the desktop project only (so counts are
 * deterministic); layout/accessibility checks run on both phone and desktop.
 */
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { asStaff, resetMfa, signInFully, STAFF } from "./admin-auth";
import { avoidRateLimitWindowEdge, expectNoHorizontalOverflow, localDb, resetRateLimits, watchConsole } from "./support";

const axe = (page: Page) =>
  new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"] })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();

const seriousViolations = async (page: Page) =>
  (await axe(page)).violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id} (${v.nodes.length})`);

const desktopOnly = (isMobile: boolean) => test.skip(isMobile, "data-changing flow runs once (desktop)");

// ---------------------------------------------------------------------------
test.describe("access control", () => {
  test("signed-out visitors are sent to sign-in; exports are refused", async ({ page, request }) => {
    for (const path of ["/admin", "/admin/events", "/admin/staff", "/admin/check-in"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/admin\/login$/);
    }
    const res = await request.get("/admin/inbox/newsletter", { maxRedirects: 0 });
    expect([302, 303, 307, 308, 403]).toContain(res.status());
  });

  test("wrong password shows one generic message", async ({ page }) => {
    await resetRateLimits();
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(STAFF.owner.email);
    await page.getByLabel("Password", { exact: true }).fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("form").getByRole("alert")).toHaveText("Incorrect email or password.");
    await page.getByLabel("Email").fill("nobody@example.test");
    await page.getByLabel("Password", { exact: true }).fill("whatever-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.locator("form").getByRole("alert")).toHaveText("Incorrect email or password.");
  });

  test("password can be shown and hidden again to check typing", async ({ page }) => {
    await page.goto("/admin/login");
    const pw = page.getByLabel("Password", { exact: true });
    await pw.fill("Typed-Check-123");
    await expect(pw).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(pw).toHaveAttribute("type", "text");
    await expect(pw).toHaveValue("Typed-Check-123");
    await expect(page.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(pw).toHaveAttribute("type", "password");
    await expect(pw).toHaveValue("Typed-Check-123");
  });

  test("a password alone never reaches the dashboard (MFA required)", async ({ page }) => {
    await resetRateLimits();
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(STAFF.owner.email);
    await page.getByLabel("Password", { exact: true }).fill(STAFF.owner.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/admin\/mfa/);
    for (const path of ["/admin", "/admin/events", "/admin/registrations"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/admin\/mfa/);
    }
  });

  test("first sign-in requires authenticator setup, then the code is required every time", async ({ page, isMobile }) => {
    desktopOnly(isMobile);
    await resetMfa(STAFF.owner.email);
    await signInFully(page, "owner"); // performs QR/secret enrolment
    await page.context().clearCookies();
    await signInFully(page, "owner"); // now asks for the 6-digit code
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Welcome");
  });

  test("sign-in is rate limited", async ({ page, isMobile }) => {
    desktopOnly(isMobile);
    test.setTimeout(150_000); // may wait up to 90s for a fresh 10-minute rate-limit window
    await avoidRateLimitWindowEdge(600);
    await resetRateLimits();
    await page.goto("/admin/login");
    for (let i = 0; i < 6; i++) {
      await page.getByLabel("Email").fill(STAFF.checkin.email);
      await page.getByLabel("Password", { exact: true }).fill(`wrong-${i}`);
      // Wait for each attempt's server round-trip before the next one.
      await Promise.all([
        page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/admin/login")),
        page.getByRole("button", { name: "Sign in" }).click(),
      ]);
    }
    await expect(page.locator("form").getByRole("alert")).toContainText("Too many sign-in attempts");
    await resetRateLimits();
  });
});

// ---------------------------------------------------------------------------
test.describe("owner dashboard", () => {
  test("overview summarises events, registrations, tickets, check-ins and sales", async ({ page }) => {
    const problems = watchConsole(page);
    await asStaff(page, "owner");
    await page.goto("/admin");
    const expected = await localDb(async (c) => (await c.query(`
      select (select count(*)::int from public.orders o join public.events e on e.id = o.event_id where o.status in ('paid','partially_refunded','refunded') and e.archived_at is null) as orders,
             (select count(*)::int from public.tickets t join public.events e on e.id = t.event_id where t.status = 'valid' and e.archived_at is null) as tickets,
             (select count(*)::int from public.tickets t join public.events e on e.id = t.event_id where t.status = 'valid' and t.checked_in_at is not null and e.archived_at is null) as checked,
             (select coalesce(sum(o.total_cents - o.amount_refunded_cents),0)::int from public.orders o join public.events e on e.id = o.event_id where o.status in ('paid','partially_refunded','refunded') and e.archived_at is null) as net`)).rows[0]);
    const stat = (label: string) => page.getByTestId(`stat-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`).getByTestId("stat-value");
    await expect(stat("Registrations")).toHaveText(String(expected.orders));
    await expect(stat("Tickets sold")).toHaveText(String(expected.tickets));
    await expect(stat("Checked in")).toHaveText(String(expected.checked));
    await expect(stat("Ticket sales")).toHaveText(`$${(expected.net / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`);
    await expect(page.getByRole("region", { name: "Upcoming events" })).toContainText("SAMPLE Networking Social");
    await expectNoHorizontalOverflow(page);
    expect(await seriousViolations(page)).toEqual([]);
    expect(problems).toEqual([]);
  });

  for (const path of ["/admin/events", "/admin/registrations", "/admin/check-in", "/admin/inbox", "/admin/activity", "/admin/staff", "/admin/account", "/admin/events/new"]) {
    test(`${path} renders cleanly and accessibly`, async ({ page }) => {
      const problems = watchConsole(page);
      await asStaff(page, "owner");
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalOverflow(page);
      expect(await seriousViolations(page)).toEqual([]);
      expect(problems).toEqual([]);
    });
  }

  test("mobile admin menu navigates", async ({ page, isMobile }) => {
    test.skip(!isMobile, "mobile only");
    await asStaff(page, "owner");
    await page.goto("/admin");
    const toggle = page.getByRole("button", { name: "Open admin menu" });
    await toggle.click();
    await page.getByRole("navigation", { name: "Admin mobile" }).getByRole("link", { name: "Registrations" }).click();
    await expect(page).toHaveURL(/\/admin\/registrations$/);
    await expect(page.getByRole("navigation", { name: "Admin mobile" })).toBeHidden();
  });
});

// ---------------------------------------------------------------------------
test.describe.serial("event lifecycle: create → tickets → images → preview → publish → duplicate → archive", () => {
  const title = `E2E Garden Brunch ${randomUUID().slice(0, 6)}`;
  let eventUrl = "";
  let slug = "";

  test("create a draft event", async ({ page, isMobile }) => {
    desktopOnly(isMobile);
    await asStaff(page, "owner");
    await page.goto("/admin/events/new");
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page.getByText("Enter a title.")).toBeVisible(); // server-side validation
    await page.getByLabel("Event title").fill(title);
    await page.getByLabel("Short description").fill("A sample event created by the end-to-end test suite.");
    await page.getByLabel("Full description").fill("Paragraph one.\n\nParagraph two.");
    await page.getByLabel("Event timezone").selectOption("America/Chicago");
    await page.getByLabel("Starts").fill("2027-05-15T11:00");
    await page.getByLabel("Ends").fill("2027-05-15T15:00");
    await page.getByLabel("Registration deadline (optional)").fill("2027-05-13T23:59");
    await page.getByLabel("Venue name").fill("Sample Garden Venue");
    await page.getByLabel("Registration status").selectOption("tickets");
    await page.getByLabel("Total capacity (optional)").fill("60");
    await page.getByRole("button", { name: "+ Add schedule item" }).click();
    await page.getByLabel("Time", { exact: true }).fill("11:00 AM");
    await page.getByLabel("What's happening *").fill("Welcome pour");
    await page.getByRole("button", { name: "+ Add question" }).click();
    await page.getByLabel("Question *").fill("Is parking available?");
    await page.getByLabel("Answer *").fill("Yes, free on-site parking.");
    await page.getByRole("button", { name: "Create draft" }).click();
    await expect(page).toHaveURL(/\/admin\/events\/[0-9a-f-]+\/tickets\?created=1$/);
    eventUrl = page.url().replace(/\/tickets.*$/, "");
    await expect(page.getByText("Draft created.")).toBeVisible();
    const row = await localDb(async (c) => (await c.query("select slug, status, starts_at, registration_closes_at, agenda, faqs from public.events where title = $1", [title])).rows[0]);
    slug = row.slug;
    expect(row).toMatchObject({ status: "draft", agenda: [{ time: "11:00 AM", title: "Welcome pour" }] });
    expect(new Date(row.starts_at).toISOString()).toBe("2027-05-15T16:00:00.000Z"); // 11:00 CDT
    expect(new Date(row.registration_closes_at).toISOString()).toBe("2027-05-14T04:59:00.000Z");
  });

  test("build tickets: validation, two tiers, edit, reorder", async ({ page, isMobile }) => {
    desktopOnly(isMobile);
    await asStaff(page, "owner");
    await page.goto(`${eventUrl}/tickets`);
    const add = page.locator("form", { has: page.getByRole("button", { name: "Add ticket" }) });
    await add.getByLabel("Ticket name").fill("General Admission");
    await add.getByLabel("Price (USD)").fill("59.999");
    await add.getByRole("button", { name: "Add ticket" }).click();
    await expect(add.getByText(/Enter a price like 25/)).toBeVisible();
    await add.getByLabel("Price (USD)").fill("59");
    await add.getByLabel("Quantity available").fill("40");
    await add.getByLabel("What's included (one per line, optional)").fill("Brunch\nNetworking");
    await add.getByRole("button", { name: "Add ticket" }).click();
    await expect(page.getByRole("heading", { name: "General Admission", level: 2 })).toBeVisible();

    const add2 = page.locator("form", { has: page.getByRole("button", { name: "Add ticket" }) });
    await add2.getByLabel("Ticket name").fill("VIP Experience");
    await add2.getByLabel("Price (USD)").fill("99.00");
    await add2.getByLabel("Quantity available").fill("10");
    await add2.getByLabel("Max per order").fill("2");
    await add2.getByLabel("Sales close / deadline (optional)").fill("2027-05-10T23:59");
    await add2.getByRole("button", { name: "Add ticket" }).click();
    await expect(page.getByRole("heading", { name: "VIP Experience", level: 2 })).toBeVisible();

    // Edit the GA price, then move VIP to the top.
    const ga = page.locator("li", { has: page.getByRole("heading", { name: "General Admission", level: 2 }) });
    await ga.getByText("Edit this ticket").click();
    await ga.getByLabel("Price (USD)").fill("65");
    await ga.getByRole("button", { name: "Save ticket" }).click();
    await expect(ga.getByText("Ticket updated.")).toBeVisible();
    const vip = page.locator("li", { has: page.getByRole("heading", { name: "VIP Experience", level: 2 }) });
    await vip.getByRole("button", { name: "↑ Move up" }).click();
    await expect(page.locator("h2.text-lg").first()).toHaveText("VIP Experience");

    const tiers = await localDb(async (c) => (await c.query(
      "select t.name, t.price_cents, t.capacity, t.max_per_order, t.sales_end_at, t.inclusions from public.ticket_types t join public.events e on e.id = t.event_id where e.title = $1 order by t.sort_order", [title])).rows);
    expect(tiers.map((t) => [t.name, t.price_cents, t.capacity, t.max_per_order])).toEqual([["VIP Experience", 9900, 10, 2], ["General Admission", 6500, 40, null]]);
    expect(new Date(tiers[0].sales_end_at).toISOString()).toBe("2027-05-11T04:59:00.000Z");
    expect(tiers[1].inclusions).toEqual(["Brunch", "Networking"]);
  });

  test("upload an image: re-encoded to WebP, metadata stripped, set as cover", async ({ page, isMobile }) => {
    desktopOnly(isMobile);
    mkdirSync("test-results", { recursive: true });
    const file = "test-results/e2e-upload.jpg";
    await sharp({ create: { width: 1800, height: 1000, channels: 3, background: "#c2185b" } })
      .jpeg().withExif({ IFD0: { Artist: "E2E Camera", Copyright: "secret-location" } }).toFile(file);
    expect((await sharp(file).metadata()).exif).toBeDefined();

    await asStaff(page, "owner");
    await page.goto(`${eventUrl}/media`);
    await page.getByLabel("Image file").setInputFiles(file);
    await page.getByLabel("Image description (for screen readers)").fill("A pink sample image");
    await page.getByRole("button", { name: "Upload" }).click();
    await expect(page.getByText("Image uploaded and set as the cover.")).toBeVisible();
    const media = await localDb(async (c) => (await c.query(
      "select m.storage_path, m.width, m.height, e.cover_image_path from public.event_media m join public.events e on e.id = m.event_id where e.title = $1", [title])).rows[0]);
    expect(media.storage_path).toMatch(/\.webp$/);
    expect(media.cover_image_path).toBe(media.storage_path);
    const img = await page.request.get(`http://127.0.0.1:54321/storage/v1/object/public/event-media/${media.storage_path}`);
    expect(img.status()).toBe(200);
    expect(img.headers()["content-type"]).toContain("image/webp");
    const meta = await sharp(await img.body()).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined(); // EXIF (incl. any GPS) removed

    // Non-images are rejected even if renamed.
    const fake = "test-results/not-an-image.png";
    (await import("node:fs")).writeFileSync(fake, "<svg onload=alert(1)>");
    await page.getByLabel("Image file").setInputFiles({ name: "evil.png", mimeType: "image/png", buffer: Buffer.from("<svg onload=alert(1)>") });
    await page.getByRole("button", { name: "Upload" }).click();
    await expect(page.getByText("That file couldn't be read as an image.")).toBeVisible();
  });

  test("preview a draft exactly as visitors will see it; the public can't see it yet", async ({ page, isMobile }) => {
    desktopOnly(isMobile);
    await asStaff(page, "owner");
    await page.goto(`${eventUrl}/preview`);
    await expect(page.getByRole("status").first()).toContainText("not visible to the public");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page.locator("#tickets")).toContainText("VIP Experience");
    await expect(page.locator("#tickets")).toContainText("$65.00");
    await expect(page.getByText("Welcome pour")).toBeVisible();
    await page.goto(`/events/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/run dry/i);
  });

  test("publish → live on the website; unpublish → hidden again", async ({ page, isMobile }) => {
    desktopOnly(isMobile);
    await asStaff(page, "owner");
    await page.goto(eventUrl);
    await page.getByRole("button", { name: "Publish" }).click();
    await expect(page.getByText("Event published")).toBeVisible();
    await page.goto(`/events/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page.getByRole("complementary", { name: "Registration" })).toContainText("General Admission$65.00");
    await expect(page.locator("img[src*='event-media']").first()).toBeVisible(); // uploaded cover
    await page.goto("/events");
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    await page.goto(eventUrl);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Unpublish" }).click();
    await expect(page.getByText("Event unpublished")).toBeVisible();
    await page.goto(`/events/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/run dry/i);
  });

  test("edit details and see the change audited", async ({ page, isMobile }) => {
    desktopOnly(isMobile);
    await asStaff(page, "owner");
    await page.goto(eventUrl);
    await page.getByLabel("Dress code (optional)").fill("Garden chic");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Event saved.").first()).toBeVisible();
    await page.goto("/admin/activity");
    await expect(page.getByRole("region", { name: "Activity" })).toContainText("Edited event");
    await expect(page.getByRole("region", { name: "Activity" })).toContainText(title);
  });

  test("duplicate creates a draft copy with tickets", async ({ page, isMobile }) => {
    desktopOnly(isMobile);
    await asStaff(page, "owner");
    await page.goto(eventUrl);
    await page.getByRole("button", { name: "Duplicate" }).click();
    await expect(page.getByText("This is a new draft copy.")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`${title} (copy)`);
    await page.getByRole("link", { name: "Tickets" }).click();
    await expect(page.getByRole("heading", { name: "VIP Experience", level: 2 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "General Admission", level: 2 })).toBeVisible();
  });

  test("archive hides the event; restore brings it back as a draft", async ({ page, isMobile }) => {
    desktopOnly(isMobile);
    await asStaff(page, "owner");
    await page.goto(eventUrl);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Archive" }).click();
    await expect(page.getByText("Event archived")).toBeVisible();
    await expect(page.getByRole("button", { name: "Restore from archive" })).toBeVisible();
    await page.goto("/admin/events");
    await expect(page.getByText(title, { exact: true })).toHaveCount(0);
    await page.goto("/admin/events?view=archived");
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await page.goto(eventUrl);
    await page.getByRole("button", { name: "Restore from archive" }).click();
    await expect(page.getByText("restored from the archive")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
test.describe("registrations & attendees", () => {
  test("event attendee list, search, CSV exports (audited)", async ({ page, isMobile }) => {
    desktopOnly(isMobile);
    await asStaff(page, "owner");
    const eventId = await localDb(async (c) => (await c.query("select id from public.events where slug = 'sample-networking-social'")).rows[0].id);
    await page.goto(`/admin/events/${eventId}/registrations`);
    await expect(page.getByRole("region", { name: "Attendees" })).toContainText("Sample Guest Avery");
    await page.getByLabel("Search attendees").fill("devon");
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("region", { name: "Attendees" }).locator("tbody tr")).toHaveCount(3);

    const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Export attendees (CSV)" }).click()]);
    const csv = await (await import("node:fs/promises")).readFile((await download.path())!, "utf8");
    expect(csv.split("\r\n")[0]).toContain("Attendee email");
    expect(csv).toContain("Sample Guest Avery");
    const audited = await localDb(async (c) => (await c.query("select count(*)::int n from public.audit_log where action = 'export.attendees' and entity_id = $1", [eventId])).rows[0].n);
    expect(audited).toBeGreaterThan(0);
  });

  test("order detail: correct an attendee's name", async ({ page, isMobile }) => {
    desktopOnly(isMobile);
    await asStaff(page, "owner");
    await page.goto("/admin/registrations?q=blake");
    await page.getByRole("link", { name: /^#\d+$/ }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Order #");
    await page.getByText("Edit attendee").first().click();
    const form = page.locator("form", { has: page.getByRole("button", { name: "Save attendee" }) }).first();
    await form.getByLabel("Name").fill("Sample Guest Blake Corrected");
    await form.getByRole("button", { name: "Save attendee" }).click();
    await expect(form.getByText("Attendee updated.")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Sample Guest Blake Corrected").first()).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
test.describe("check-in staff (restricted role)", () => {
  test("lands on check-in, sees no financial or management areas", async ({ page }) => {
    await asStaff(page, "checkin");
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/check-in/);
    const nav = page.getByRole("navigation", { name: /Admin/ }).first();
    if (await page.getByRole("button", { name: "Open admin menu" }).isVisible()) await page.getByRole("button", { name: "Open admin menu" }).click();
    for (const hidden of ["Events", "Registrations", "Staff", "Inbox", "Activity log", "Overview"]) {
      await expect(page.getByRole("link", { name: hidden, exact: true })).toHaveCount(0);
    }
    await expect(nav.or(page.getByRole("navigation", { name: "Admin mobile" }))).toBeTruthy();
    for (const path of ["/admin/events", "/admin/registrations", "/admin/staff", "/admin/events/new"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/admin\/check-in\?error=forbidden/);
    }
    const eventId = await localDb(async (c) => (await c.query("select id from public.events where slug = 'sample-networking-social'")).rows[0].id);
    expect((await page.request.get(`/admin/events/${eventId}/export/sales`)).status()).toBe(403);
    expect((await page.request.get("/admin/inbox/newsletter")).status()).toBe(403);
    await expectNoHorizontalOverflow(page);
  });

  test("finds a guest and checks them in; a second check-in is refused", async ({ page, isMobile }) => {
    desktopOnly(isMobile);
    await asStaff(page, "checkin");
    const eventId = await localDb(async (c) => (await c.query("select id from public.events where slug = 'sample-networking-social'")).rows[0].id);
    // Pick any not-yet-checked-in guest so the test is repeatable.
    const guestRow = await localDb(async (c) => (await c.query(
      `select a.full_name, tt.name as tier, t.manual_code from public.tickets t join public.attendees a on a.id = t.attendee_id
       join public.ticket_types tt on tt.id = t.ticket_type_id where t.event_id = $1 and t.status = 'valid' and t.checked_in_at is null
       order by a.full_name limit 1`, [eventId])).rows[0]);
    test.skip(!guestRow, "all sample guests already checked in — reseed the local DB");
    await page.goto(`/admin/check-in/${eventId}?q=${guestRow.manual_code}`);
    const guest = page.getByRole("main").locator("li", { hasText: guestRow.manual_code }).first();
    await expect(guest).toContainText(guestRow.tier);
    await guest.getByRole("button", { name: "Check in" }).click();
    await expect(page.getByText(`Checked in: ${guestRow.full_name} (${guestRow.tier}).`)).toBeVisible();
    await page.reload();
    await expect(page.getByRole("main").locator("li", { hasText: guestRow.manual_code }).first().getByRole("button", { name: "Check in" })).toHaveCount(0);
    await expect(page.getByText("Recent check-ins").locator("xpath=ancestor::section[1]")).toContainText(guestRow.full_name);
    const by = await localDb(async (c) => (await c.query(
      "select u.email from public.tickets t join auth.users u on u.id = t.checked_in_by where t.manual_code = $1", [guestRow.manual_code])).rows[0]?.email);
    expect(by).toBe(STAFF.checkin.email);
    expect(await seriousViolations(page)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
test.describe("staff management (owner only)", () => {
  test("add check-in staff → they sign in with a temporary password and must set up MFA → owner removes access", async ({ page, browser, isMobile }) => {
    desktopOnly(isMobile);
    const email = `e2e-door-${randomUUID().slice(0, 6)}@pynkpours.test`;
    await asStaff(page, "owner");
    await page.goto("/admin/staff");
    const form = page.locator("form", { has: page.getByRole("button", { name: "Add staff member" }) });
    await form.getByLabel("Name").fill("E2E Door Person");
    await form.getByLabel("Email").fill(email);
    await form.getByLabel("Role").selectOption("checkin");
    await form.getByRole("button", { name: "Add staff member" }).click();
    const temp = (await page.getByTestId("temp-password").textContent())!.trim();
    expect(temp.length).toBeGreaterThanOrEqual(12);

    const ctx = await browser.newContext();
    const staffPage = await ctx.newPage();
    await resetRateLimits();
    await staffPage.goto("/admin/login");
    await staffPage.getByLabel("Email").fill(email);
    await staffPage.getByLabel("Password", { exact: true }).fill(temp);
    await staffPage.getByRole("button", { name: "Sign in" }).click();
    await expect(staffPage).toHaveURL(/\/admin\/mfa\/setup$/);
    await staffPage.goto("/admin/check-in");
    await expect(staffPage).toHaveURL(/\/admin\/mfa\/setup$/); // no access before MFA setup

    await page.reload();
    const card = page.locator("li", { hasText: email });
    await expect(card).toContainText("Authenticator not set up");
    page.once("dialog", (d) => d.accept());
    await card.getByRole("button", { name: "Remove access" }).click();
    await expect(page.locator("li", { hasText: email })).toContainText("No access");
    await ctx.close();
    const audit = await localDb(async (c) => (await c.query(
      "select count(*)::int n from public.audit_log where entity_type = 'admin_profiles' and after_data->>'display_name' = 'E2E Door Person'")).rows[0].n);
    expect(audit).toBeGreaterThanOrEqual(2); // added + access removed
  });
});

// ---------------------------------------------------------------------------
test.describe("inbox", () => {
  test("shows form messages; mark handled", async ({ page, isMobile }) => {
    desktopOnly(isMobile);
    const text = `E2E inbox message ${randomUUID().slice(0, 8)}`;
    await localDb((c) => c.query("insert into public.contact_submissions (name, email, topic, message) values ('E2E Sender', 'e2e@example.test', 'general', $1)", [text]));
    await asStaff(page, "owner");
    await page.goto("/admin/inbox");
    const msg = page.locator("li", { hasText: text });
    await expect(msg).toBeVisible();
    await msg.getByRole("button", { name: "Mark handled" }).click();
    await expect(page.locator("li", { hasText: text })).toHaveCount(0);
    await page.goto("/admin/inbox?show=all");
    await expect(page.locator("li", { hasText: text })).toContainText("handled");
  });
});
