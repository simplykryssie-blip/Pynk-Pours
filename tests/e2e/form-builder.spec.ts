/**
 * Form builder end to end: the owner creates a vendor application from the
 * template and opens it; a vendor applies (with a photo upload straight to the
 * LOCAL Supabase Storage) and gets a receipt with a private status link; the
 * inbox is notified; the owner downloads the file, approves with a message
 * (the vendor is emailed and the status page updates), and exports a CSV.
 * Email goes to the LOCAL RESEND TEST DOUBLE (sends nothing).
 */
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { asStaff } from "./admin-auth";
import { humanPause, localDb, resetRateLimits } from "./support";

process.loadEnvFile(".env.local");
const RESEND = "http://127.0.0.1:12113";
type Mail = { subject: string; text: string; html: string; reply_to?: string[] };
const serious = async (page: Page) => (await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"] }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations
  .filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id} (${v.nodes.length})`);
const inbox = async (to: string): Promise<Mail[]> => (await fetch(`${RESEND}/__test/emails?to=${encodeURIComponent(to)}`)).json();

test.describe.configure({ mode: "serial" });
test.skip(({ isMobile }) => isMobile, "runs once; the applicant step uses a phone-sized window");
test.beforeEach(async () => { await resetRateLimits(); });

const tag = randomUUID().slice(0, 6);
const title = `Vendor Application ${tag}`;
const slug = `vendor-application-${tag}`;
const vendorEmail = `vendor-${tag}@example.test`;
let statusUrl = "";

test.afterAll(async () => {
  await localDb(async (c) => {
    await c.query("delete from public.form_submissions where form_id in (select id from public.forms where slug = $1)", [slug]);
    await c.query("delete from public.forms where slug = $1", [slug]);
  });
});

test("owner creates a vendor application from the template and opens it", async ({ page }) => {
  await asStaff(page, "owner");
  await page.goto("/admin/forms");
  await page.getByRole("link", { name: "+ New form" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "New form" })).toBeVisible();
  await page.getByRole("textbox", { name: /^Form title/ }).fill(title);
  await page.getByRole("radio", { name: /Vendor application/ }).check();
  await page.getByRole("button", { name: "Create form" }).click();
  await expect(page.getByText("Form created as a draft.")).toBeVisible();
  await expect(page.getByTestId("question")).toHaveCount(12);
  expect(await serious(page)).toEqual([]);
  // Drafts aren't public.
  expect((await page.request.get(`/forms/${slug}`)).status()).toBe(200);
  await expect(async () => {
    const html = await (await page.request.get(`/forms/${slug}`)).text();
    expect(html).not.toContain("Business name");
  }).toPass();
  // Add a question, then open the form.
  await page.getByRole("button", { name: "+ Add question" }).click();
  const q = page.getByTestId("question").last();
  await q.getByRole("textbox", { name: "Question", exact: true }).fill("Which days can you attend?");
  await q.getByRole("combobox", { name: "Answer type" }).selectOption("checkboxes");
  await q.getByRole("textbox", { name: /Choices/ }).fill("Saturday\nSunday");
  await page.getByRole("combobox", { name: "Status" }).selectOption("open");
  await page.getByRole("button", { name: "Save form" }).click();
  await expect(page.getByText(`Form saved. It's live at /forms/${slug}.`)).toBeVisible();
});

test("a vendor applies from their phone, with a photo, and gets a private status link", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`/forms/${slug}`);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  expect(await serious(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const main = page.getByRole("main");
  // Missing answers are reported next to each question, and typed answers are kept.
  await main.getByRole("textbox", { name: /^Business name/ }).fill(`Sweet Treats ${tag}`);
  await humanPause(page);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("alert").first()).toContainText("Please fix the highlighted questions.");
  await expect(page.getByText("“Your name” is required.")).toBeVisible();
  await expect(main.getByRole("textbox", { name: /^Business name/ })).toHaveValue(`Sweet Treats ${tag}`);

  await main.getByRole("textbox", { name: /^Your name/ }).fill(`Val ${tag}`);
  await main.getByRole("textbox", { name: /^Email/ }).fill(vendorEmail);
  await main.getByRole("textbox", { name: /^Phone/ }).fill("337-555-0100");
  await main.getByRole("combobox", { name: /What do you sell/ }).selectOption("Desserts & baked goods");
  await main.getByRole("textbox", { name: /Tell us about your business/ }).fill("Cupcakes and cookies, beautifully boxed.");
  await main.getByRole("radio", { name: "No" }).check();
  await main.getByRole("checkbox", { name: "Saturday" }).check();
  await main.getByRole("checkbox", { name: /I agree to follow/ }).check();
  const photo = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#ff66aa" } }).jpeg().toBuffer();
  await main.getByLabel(/Photos of your products or booth/).setInputFiles({ name: "booth photo.jpg", mimeType: "image/jpeg", buffer: photo });
  await expect(main.getByRole("list", { name: /Uploaded for Photos/ })).toContainText("booth photo.jpg");
  await humanPause(page);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page).toHaveURL(/\/forms\/status\/[A-Za-z0-9_-]{43}\?sent=1$/);
  await expect(page.getByText("Thank you, your response was sent.")).toBeVisible();
  await expect(page.getByTestId("form-status")).toHaveText("New");
  expect(await serious(page)).toEqual([]);
  await ctx.close();

  await expect.poll(async () => (await inbox(vendorEmail)).length, { timeout: 20_000 }).toBe(1);
  const [receipt] = await inbox(vendorEmail);
  expect(receipt.subject).toBe(`We received your ${title}`);
  expect(receipt.text).toContain(`Business name: Sweet Treats ${tag}`);
  statusUrl = receipt.text.match(/Check status: (\S+)/)![1];
  expect(statusUrl).toMatch(/\/forms\/status\/[A-Za-z0-9_-]{43}$/);

  await expect.poll(async () => (await inbox("inbox@pynkpours.test")).filter((m) => m.subject.includes(title)).length, { timeout: 20_000 }).toBe(1);
  const note = (await inbox("inbox@pynkpours.test")).find((m) => m.subject.includes(title))!;
  expect(note.reply_to).toEqual([vendorEmail]);
  expect(note.text).not.toContain("/forms/status/"); // the private link never goes to staff
});

test("owner reviews: downloads the photo, approves with a message, exports a CSV", async ({ page }) => {
  test.skip(!statusUrl, "needs the previous test");
  await asStaff(page, "owner");
  await page.goto("/admin/forms");
  await page.getByRole("link", { name: /Responses \(1\)/ }).first().click();
  await page.getByRole("link", { name: new RegExp(`Val ${tag}`) }).click();
  await expect(page.getByRole("heading", { level: 1, name: `Val ${tag}` })).toBeVisible();
  expect(await serious(page)).toEqual([]);
  const answers = page.getByRole("region", { name: "Answers" });
  await expect(answers).toContainText("Desserts & baked goods");
  await expect(answers).toContainText("Saturday");
  const fileHref = await answers.getByRole("link", { name: "booth photo.jpg" }).getAttribute("href");
  const file = await page.request.get(fileHref!);
  expect(file.status()).toBe(200);
  expect((await file.body()).subarray(0, 3).toString("hex")).toBe("ffd8ff"); // the JPEG itself

  const statusCard = page.getByRole("region", { name: "Status" });
  await statusCard.getByRole("combobox", { name: "Status" }).selectOption("approved");
  await statusCard.getByRole("textbox", { name: /Message to the applicant/ }).fill("Welcome aboard! Booth 4, set-up at 9am.");
  await statusCard.getByRole("button", { name: "Update status" }).click();
  await expect(statusCard.getByText("Marked Approved. The applicant has been emailed.")).toBeVisible();

  await expect.poll(async () => (await inbox(vendorEmail)).length, { timeout: 20_000 }).toBe(2);
  const update = (await inbox(vendorEmail))[1];
  expect(update.subject).toBe(`Good news about your ${title}`);
  expect(update.text).toContain("Booth 4, set-up at 9am.");

  await page.goto(statusUrl.replace(/^https?:\/\/[^/]+/, ""));
  await expect(page.getByTestId("form-status")).toHaveText("Approved");

  const formId = await localDb(async (c) => (await c.query("select id from public.forms where slug = $1", [slug])).rows[0].id);
  const csv = await (await page.request.get(`/admin/forms/${formId}/export`)).text();
  expect(csv.split("\r\n")[0]).toContain("Business name");
  expect(csv).toContain(`Sweet Treats ${tag}`);
  expect(csv).toContain("Approved");
});

test("check-in staff can't open forms or responses", async ({ page }) => {
  await asStaff(page, "checkin");
  await page.goto("/admin/forms");
  await expect(page).toHaveURL(/\/admin\/check-in\?error=forbidden/);
  const formId = await localDb(async (c) => (await c.query("select id from public.forms where slug = $1", [slug])).rows[0]?.id);
  if (formId) expect((await page.request.get(`/admin/forms/${formId}/export`)).status()).toBe(403);
});
