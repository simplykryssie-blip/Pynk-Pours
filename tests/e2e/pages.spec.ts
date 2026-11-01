import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow, watchConsole } from "./support";

const PAGES = [
  { path: "/", h1: /Where ideas meet/i },
  { path: "/about", h1: /About/i },
  { path: "/experiences", h1: /The PynkPours/i },
  { path: "/events", h1: /PynkPours/i },
  { path: "/events?view=past", h1: /PynkPours/i },
  { path: "/events/entrepreneurial-brunch", h1: /The Entrepreneurial Brunch/i },
  { path: "/events/sample-networking-social", h1: /SAMPLE Networking Social/i },
  { path: "/events/sample-sold-out-workshop", h1: /SAMPLE Sold-Out Workshop/i },
  { path: "/events/sample-past-gathering", h1: /SAMPLE Past Gathering/i },
  { path: "/partners", h1: /Partner with/i },
  { path: "/contact", h1: /Contact/i },
  { path: "/privacy", h1: /Privacy Policy/i },
  { path: "/terms", h1: /Terms of Use/i },
  { path: "/refunds", h1: /Refund Policy/i },
];

for (const { path, h1 } of PAGES) {
  test(`${path} renders, fits the viewport, and passes accessibility checks`, async ({ page }) => {
    const problems = watchConsole(page);
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(h1);
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("contentinfo")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expectNoHorizontalOverflow(page);

    // Cast: @axe-core/playwright bundles slightly older Playwright types (runtime-compatible).
    const axe = await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"] }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    const serious = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
    expect(problems).toEqual([]);
  });
}

test("unknown route shows the branded 404", async ({ page }) => {
  const res = await page.goto("/this-page-does-not-exist");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/run dry/i);
});

test("every internal link on every page resolves", async ({ page, request }) => {
  const hrefs = new Set<string>();
  for (const { path } of PAGES) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    for (const href of await page.locator("a[href^='/']").evaluateAll((as) => as.map((a) => a.getAttribute("href")!))) {
      hrefs.add(href.split("#")[0] || "/");
    }
  }
  expect(hrefs.size).toBeGreaterThan(15);
  for (const href of hrefs) {
    const r = await request.get(href);
    expect(r.status(), href).toBeLessThan(400);
  }
});
