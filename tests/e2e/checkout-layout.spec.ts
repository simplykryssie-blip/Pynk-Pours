/** Checkout + order pages: phone/desktop layout and accessibility (axe), using the local Stripe double. */
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalOverflow, resetRateLimits, watchConsole } from "./support";

const serious = async (page: Page) =>
  (await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"] }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze())
    .violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id} (${v.nodes.length})`);

test("ticket selector → checkout → order page fit the screen and pass accessibility checks", async ({ page }) => {
  await resetRateLimits();
  const problems = watchConsole(page);
  await page.goto("/events/sample-networking-social");
  const ga = page.getByRole("group", { name: "Quantity for Sample General Admission" });
  await ga.getByRole("button", { name: "More Sample General Admission" }).click();
  await ga.getByRole("button", { name: "More Sample General Admission" }).click();
  await expectNoHorizontalOverflow(page);
  await page.getByRole("link", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your registration" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(await serious(page)).toEqual([]);

  // Validation errors appear next to fields.
  await page.waitForTimeout(2700);
  await page.getByRole("button", { name: "Continue to secure payment" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Please fix the highlighted fields");
  await expect(page.getByText("Please confirm you've read the event details and refund policy.")).toBeVisible();
  expect(await serious(page)).toEqual([]);

  const tag = randomUUID().slice(0, 8);
  const main = page.getByRole("main");
  await main.getByRole("textbox", { name: "Full name", exact: true }).fill(`Layout ${tag}`);
  await main.getByRole("textbox", { name: "Email", exact: true }).fill(`layout-${tag}@example.test`);
  await main.getByRole("button", { name: "Use my details for this guest" }).first().click();
  await expect(main.getByRole("textbox", { name: "Guest name" }).first()).toHaveValue(`Layout ${tag}`);
  await main.getByRole("textbox", { name: "Guest name" }).nth(1).fill(`Guest two ${tag}`);
  await main.getByRole("textbox", { name: "Guest email" }).nth(1).fill(`g2-${tag}@example.test`);
  await page.getByText(/I confirm every guest is/).click();
  await page.getByText(/I've read the event details/).click();
  await page.getByRole("button", { name: "Continue to secure payment" }).click();
  await expect(page.getByText("LOCAL STRIPE TEST DOUBLE")).toBeVisible();
  await page.getByRole("link", { name: "← Back" }).click();
  await expect(page.getByRole("heading", { name: "You left the payment page." })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(await serious(page)).toEqual([]);
  // Release the held seats so repeated runs don't consume inventory.
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Cancel order" }).click();
  await expect(page.getByRole("heading", { name: "This order was cancelled." })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(problems.filter((p) => !p.includes("127.0.0.1:12111"))).toEqual([]);
});
