import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { asStaff, signInFully } from "../e2e/admin-auth";
import { localDb } from "../e2e/support";
import { shooter } from "./shot";

const shot = shooter("docs/qa/stage-c");

test("PynkPours admin walkthrough", async ({ page, browser }) => {
  // 1) Sign in: password, then the 6-digit authenticator code.
  await page.goto("/admin/login");
  await shot(page, "Staff sign-in — PynkPours team members only");
  await signInFully(page, "owner");
  await shot(page, "Overview: events, registrations, tickets sold, check-ins and sales");

  // 2) Create an event.
  await page.getByRole("link", { name: "+ New event" }).click();
  await page.getByLabel("Event title").fill("DEMO Spring Social (sample)");
  await page.getByLabel("Label (optional)").fill("Networking Social");
  await page.getByLabel("Short description").fill("DEMO event created for the Stage C walkthrough. Not a real PynkPours event.");
  await page.getByLabel("Full description").fill("This sample event shows how events are created in the dashboard.\n\nAll details here are placeholders.");
  await page.getByLabel("Starts").fill("2027-04-17T18:00");
  await page.getByLabel("Ends").fill("2027-04-17T21:00");
  await page.getByLabel("Registration deadline (optional)").fill("2027-04-16T23:59");
  await page.getByLabel("Venue name").fill("Sample Venue (demo)");
  await page.getByLabel("Venue address").fill("123 Example Street, Example City");
  await page.getByLabel("Registration status").selectOption("tickets");
  await page.getByLabel("Total capacity (optional)").fill("80");
  await page.getByLabel("Minimum age (optional)").fill("21");
  await page.getByRole("button", { name: "+ Add schedule item" }).click();
  await page.getByLabel("Time", { exact: true }).fill("6:00 PM");
  await page.getByLabel("What's happening *").fill("Welcome pour & introductions");
  await page.getByRole("button", { name: "+ Add question" }).click();
  await page.getByLabel("Question *").fill("Is this a real event?");
  await page.getByLabel("Answer *").fill("No — this is demo data for the dashboard walkthrough.");
  await page.getByLabel("Event title").scrollIntoViewIfNeeded();
  await shot(page, "Create an event: details, event-timezone dates, registration deadline");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/tickets\?created=1$/);
  const eventUrl = page.url().replace(/\/tickets.*$/, "");

  // 3) Ticket builder: three flexible tiers.
  const add = () => page.locator("form", { has: page.getByRole("button", { name: "Add ticket" }) });
  const addTier = async (t: { name: string; price: string; qty: string; max?: string; admits?: string; incl?: string }) => {
    await add().getByLabel("Ticket name").fill(t.name);
    await add().getByLabel("Price (USD)").fill(t.price);
    await add().getByLabel("Quantity available").fill(t.qty);
    if (t.max) await add().getByLabel("Max per order").fill(t.max);
    if (t.admits) await add().getByLabel("Guests per ticket").fill(t.admits);
    if (t.incl) await add().getByLabel("What's included (one per line, optional)").fill(t.incl);
    await add().getByRole("button", { name: "Add ticket" }).click();
    await expect(page.getByRole("heading", { name: t.name, level: 2 })).toBeVisible();
  };
  await addTier({ name: "Early Bird (demo)", price: "35", qty: "20", incl: "Welcome pour\nNetworking" });
  await addTier({ name: "General Admission (demo)", price: "45", qty: "40" });
  await addTier({ name: "Table for 4 (demo)", price: "160", qty: "5", max: "1", admits: "4", incl: "Reserved table\nFour individual QR tickets" });
  await page.getByRole("heading", { name: "Early Bird (demo)", level: 2 }).scrollIntoViewIfNeeded();
  await shot(page, "Ticket builder: custom names, prices, quantities, sale windows (VIP optional)", { fullPage: true });

  // 4) Images.
  const img = "test-results/demo-cover.jpg";
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><defs><radialGradient id="g" cx="30%" cy="20%"><stop offset="0" stop-color="#5a1f3d"/><stop offset="1" stop-color="#0b0b0b"/></radialGradient></defs><rect width="1600" height="900" fill="url(#g)"/><circle cx="800" cy="450" r="330" fill="none" stroke="#c8a45d" stroke-width="3"/><text x="800" y="470" font-family="Georgia" font-size="72" fill="#f7f1ed" text-anchor="middle" font-style="italic">DEMO cover image</text></svg>`);
  await sharp(svg).jpeg().toFile(img);
  await page.getByRole("link", { name: "Images" }).click();
  await page.getByLabel("Image file").setInputFiles(img);
  await page.getByLabel("Image description (for screen readers)").fill("Demo cover image");
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText("Image uploaded and set as the cover.")).toBeVisible();
  await shot(page, "Image uploads: cover + gallery + shareable promo links (EXIF/GPS stripped)");

  // 5) Preview before publishing.
  await page.goto(`${eventUrl}/preview`);
  await shot(page, "Preview: exactly what guests will see — not public yet");
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(400);
  await shot(page, "Preview: ticket options, schedule and FAQs from the builder");

  // 6) Publish and view live.
  await page.goto(eventUrl);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Event published")).toBeVisible();
  await shot(page, "Published — one click; Unpublish, Duplicate and Archive are alongside");
  const slug = await localDb(async (c) => (await c.query("select slug from public.events where id = $1", [eventUrl.split("/").pop()])).rows[0].slug);
  await page.goto(`/events/${slug}`);
  await shot(page, "Live on the public website with the uploaded cover");
  await page.goto("/events");
  await shot(page, "Listed on the public Events page");

  // 7) Registrations & attendees (SAMPLE orders from the local seed).
  const sampleId = await localDb(async (c) => (await c.query("select id from public.events where slug = 'sample-networking-social'")).rows[0].id);
  await page.goto(`/admin/events/${sampleId}/registrations`);
  await shot(page, "Registrations: attendee list, search, CSV exports, get-notified & waitlist");
  await page.goto("/admin/registrations");
  await page.getByRole("link", { name: /^#\d+$/ }).first().click();
  await shot(page, "Order detail: purchase, attendees, ticket codes; attendee corrections are audited");

  // 8) Staff & activity.
  await page.goto("/admin/staff");
  await shot(page, "Staff roles: Owner, Admin, Check-in staff (no financial access)");
  await page.goto("/admin/activity");
  await shot(page, "Activity log: permanent record of changes and exports");

  // 9) Check-in staff on a phone.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, recordVideo: { dir: "test-results/demo/phone", size: { width: 390, height: 844 } } });
  const p = await phone.newPage();
  await asStaff(p, "checkin");
  await p.goto("/admin/check-in");
  await shot(p, "Phone: check-in staff see only Check-in");
  await p.goto(`/admin/check-in/${sampleId}?q=sample`);
  await shot(p, "Phone: find a guest and check them in");
  await p.getByRole("button", { name: "Open admin menu" }).click();
  await shot(p, "Phone: role-limited menu");
  await phone.close();

  // 10) Owner on a phone: ticket builder.
  const phone2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p2 = await phone2.newPage();
  await asStaff(p2, "owner");
  await p2.goto(`${eventUrl}/tickets`);
  await shot(p2, "Phone: manage tickets on the go");
  await p2.goto("/admin");
  await shot(p2, "Phone: dashboard overview");
  await phone2.close();
});
