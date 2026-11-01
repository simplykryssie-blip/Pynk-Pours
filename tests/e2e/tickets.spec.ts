/**
 * Stage E: emails, QR tickets and camera check-in, end to end. Email goes to the
 * LOCAL RESEND TEST DOUBLE (tests/support/resend-double.mts — sends nothing).
 * The door scan uses Chromium's fake camera fed with a video of the QR code
 * taken from the guest's ticket email, so the whole path is exercised:
 * email attachment → camera → jsQR → server check-in.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import jsQR from "jsqr";
import sharp from "sharp";
import { asStaff } from "./admin-auth";
import { humanPause, localDb, resetRateLimits } from "./support";

process.loadEnvFile(".env.local");
const RESEND = "http://127.0.0.1:12113";
const FAKE_VIDEO = path.resolve("test-results/.fake-camera/ticket.y4m");

type Mail = { subject: string; html: string; text: string; from: string; reply_to?: string[]; attachments?: { filename: string; content: string; content_id?: string }[] };
const inbox = async (to: string): Promise<Mail[]> => (await fetch(`${RESEND}/__test/emails?to=${encodeURIComponent(to)}`)).json();

test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "runs once (desktop)");
test.beforeEach(async () => { await resetRateLimits(); });
// Fake camera for the door-scan tests; the clip is written by the first test (Chromium opens it when the camera starts).
test.use({
  permissions: ["camera"],
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${FAKE_VIDEO}`] },
});

/** A 640×480 Y4M clip of the QR code on white, for --use-file-for-fake-video-capture. */
async function writeFakeCamera(png: Buffer) {
  const W = 640, H = 480;
  const y = await sharp(png).resize(400, 400).flatten({ background: "#ffffff" })
    .extend({ top: 40, bottom: 40, left: 120, right: 120, background: "#ffffff" })
    .grayscale().raw().toBuffer();
  const uv = Buffer.alloc((W / 2) * (H / 2), 128);
  const frame = Buffer.concat([Buffer.from("FRAME\n"), y.subarray(0, W * H), uv, uv]);
  mkdirSync(path.dirname(FAKE_VIDEO), { recursive: true });
  writeFileSync(FAKE_VIDEO, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), ...Array(10).fill(frame)]));
}

let ticketCredential = "";
let ticketCode = "";
let eventId = "";
const guestEmail = (tag: string) => `scan-${tag}@example.test`;

async function registerFree(page: Page, slug: string, tag: string) {
  await page.goto(`/events/${slug}`);
  await page.getByRole("link", { name: "Continue" }).click();
  const main = page.getByRole("main");
  await main.getByRole("textbox", { name: "Full name", exact: true }).fill(`Buyer ${tag}`);
  await main.getByRole("textbox", { name: "Email", exact: true }).fill(`buyer-${tag}@example.test`);
  await page.getByTestId("guest-0").getByRole("textbox", { name: "Guest name" }).fill(`Scan Guest ${tag}`);
  await page.getByTestId("guest-0").getByRole("textbox", { name: "Guest email" }).fill(guestEmail(tag));
  await page.getByText(/I've read the event details/).click();
  await page.getByText("I confirm every guest is 18 or older and will bring valid ID.").click();
  await page.waitForTimeout(2700);
  await page.getByRole("button", { name: "Complete registration" }).click();
  await expect(page.getByRole("heading", { name: "You're registered!" })).toBeVisible();
}

test("free registration emails a confirmation to the buyer and a QR ticket to the guest", async ({ page }) => {
  const tag = randomUUID().slice(0, 8);
  const slug = `sample-scan-${tag}`;
  eventId = await localDb(async (c) => {
    const ev = (await c.query(`insert into public.events (slug, title, short_description, starts_at, ends_at, timezone, venue_name, registration_mode)
      values ($1, 'SAMPLE Scan Night (not real)', 'SAMPLE', now() + interval '10 day', now() + interval '10 day 2 hour', 'America/Chicago', 'Sample Venue', 'tickets') returning id`, [slug])).rows[0].id;
    await c.query("insert into public.ticket_types (event_id, name, price_cents, capacity) values ($1, 'Free RSVP', 0, 5)", [ev]);
    await c.query("update public.events set status = 'published' where id = $1", [ev]);
    return ev as string;
  });
  await registerFree(page, slug, tag);
  const orderUrl = page.url();

  // The ticket page itself shows a QR code for each valid ticket.
  await expect(page.getByTestId("ticket-qr")).toHaveCount(1);

  await expect.poll(async () => (await inbox(`buyer-${tag}@example.test`)).length, { timeout: 20_000 }).toBe(1);
  const [confirmation] = await inbox(`buyer-${tag}@example.test`);
  expect(confirmation.subject).toBe("You're registered!: SAMPLE Scan Night (not real) (order #" + confirmation.subject.match(/#(\d+)/)![1] + ")");
  expect(confirmation.from).toBe("PynkPours <tickets@pynkpours.test>");
  expect(confirmation.text).toContain(orderUrl);

  await expect.poll(async () => (await inbox(guestEmail(tag))).length, { timeout: 20_000 }).toBe(1);
  const [ticket] = await inbox(guestEmail(tag));
  expect(ticket.subject).toBe("Your ticket: SAMPLE Scan Night (not real)");
  const qr = ticket.attachments?.[0];
  expect(qr?.content_id).toMatch(/^ticket-/);
  expect(ticket.html).toContain(`cid:${qr!.content_id}`);

  const png = Buffer.from(qr!.content, "base64");
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  ticketCredential = jsQR(new Uint8ClampedArray(data), info.width, info.height)!.data;
  expect(ticketCredential).toMatch(/^[A-Za-z0-9_-]{43}$/);
  ticketCode = await localDb(async (c) => (await c.query(
    "select t.manual_code from public.tickets t join public.attendees a on a.id = t.attendee_id where a.email = $1", [guestEmail(tag)])).rows[0].manual_code);
  expect(ticket.text).toContain(`${ticketCode.slice(0, 4)}-${ticketCode.slice(4)}`);
  await writeFakeCamera(png);

  // Each message is recorded as sent exactly once.
  const rows = await localDb(async (c) => (await c.query(
    "select kind, status from public.email_messages where to_email in ($1, $2) order by kind", [`buyer-${tag}@example.test`, guestEmail(tag)])).rows);
  expect(rows).toEqual([{ kind: "order_confirmation", status: "sent" }, { kind: "ticket", status: "sent" }]);
});

test.describe("door scanning with the phone camera", () => {
  test("scanning the emailed QR checks the guest in; scanning again says already checked in", async ({ page }) => {
    test.skip(!ticketCredential, "needs the previous test's ticket");
    await asStaff(page, "checkin");
    await page.goto(`/admin/check-in/${eventId}`);
    await page.getByRole("button", { name: "Start camera" }).click();
    const result = page.getByTestId("scan-result");
    await expect(result).toHaveAttribute("data-result", "accepted", { timeout: 15_000 });
    await expect(result).toContainText(`Scan Guest`);
    const checked = await localDb(async (c) => (await c.query("select checked_in_at from public.tickets where manual_code = $1", [ticketCode])).rows[0].checked_in_at);
    expect(checked).not.toBeNull();
    // The camera keeps seeing the same code; after the repeat window it is re-checked and refused.
    await expect(result).toHaveAttribute("data-result", "already_checked_in", { timeout: 15_000 });
    await expect(result).toContainText("First checked in at");
    await page.getByRole("button", { name: "Stop camera" }).click();
    await expect(page.getByRole("button", { name: "Start camera" })).toBeVisible();
  });

  test("the same ticket scanned at a different event's door is refused as wrong event", async ({ page }) => {
    test.skip(!ticketCredential, "needs the first test's ticket");
    await asStaff(page, "checkin");
    const other = await localDb(async (c) => (await c.query("select id from public.events where slug = 'sample-networking-social'")).rows[0].id);
    await page.goto(`/admin/check-in/${other}`);
    await page.getByRole("button", { name: "Start camera" }).click();
    await expect(page.getByTestId("scan-result")).toHaveAttribute("data-result", "wrong_event", { timeout: 15_000 });
    await expect(page.getByTestId("scan-result")).toContainText("Ticket for a different event");
  });
});

test("email cron endpoint requires the CRON_SECRET bearer token", async ({ request }) => {
  expect((await request.get("/api/cron/emails")).status()).toBe(401);
  expect((await request.get("/api/cron/emails", { headers: { Authorization: "Bearer wrong" } })).status()).toBe(401);
  const ok = await request.get("/api/cron/emails", { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
  expect(ok.status()).toBe(200);
  expect(await ok.json()).toMatchObject({ sent: expect.any(Number), failed: 0 });
});

test("a contact form message notifies the PynkPours inbox, with reply-to set to the sender", async ({ page }) => {
  const tag = randomUUID().slice(0, 8);
  await page.goto("/contact");
  const main = page.getByRole("main");
  await main.getByLabel("Full name").fill(`Contact ${tag}`);
  await main.getByLabel("Email address").fill(`contact-${tag}@example.test`);
  await main.getByLabel("Your message").fill(`Hello from the e2e test ${tag}, checking the inbox notification.`);
  await humanPause(page);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("status")).toContainText("Thank you");
  await expect.poll(async () => (await inbox("inbox@pynkpours.test")).filter((m) => m.text.includes(tag)).length, { timeout: 20_000 }).toBe(1);
  const m = (await inbox("inbox@pynkpours.test")).find((x) => x.text.includes(tag))!;
  expect(m.reply_to).toEqual([`contact-${tag}@example.test`]);
  expect(m.subject).toContain(`Contact ${tag}`);
});
