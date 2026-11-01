import { expect, test } from "@playwright/test";
import { openMobileMenu } from "./support";

const ITEMS = ["Home", "Experiences", "Events", "About", "Partners", "Contact"];

test("primary navigation works and marks the current page", async ({ page, isMobile }) => {
  await page.goto("/");
  for (const label of ITEMS.slice(1)) {
    if (isMobile) {
      await openMobileMenu(page);
      const menu = page.getByRole("navigation", { name: "Mobile" });
      await expect(menu).toBeVisible();
      await menu.getByRole("link", { name: label, exact: true }).click();
      await expect(menu).toBeHidden(); // closes after navigating
    } else {
      await page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: label, exact: true }).click();
    }
    await expect(page).toHaveURL(new RegExp(`/${label.toLowerCase()}$`));
    if (!isMobile) {
      await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: label, exact: true }))
        .toHaveAttribute("aria-current", "page");
    }
  }
});

test("mobile menu closes with Escape and returns focus", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile only");
  await page.goto("/about");
  await openMobileMenu(page);
  await expect(page.getByRole("navigation", { name: "Mobile" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("navigation", { name: "Mobile" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
});

test("logo returns home; header CTA goes to events", async ({ page, isMobile }) => {
  await page.goto("/contact");
  await page.getByRole("link", { name: "PynkPours — home" }).first().click();
  await expect(page).toHaveURL(/\/$/);
  if (isMobile) {
    await openMobileMenu(page);
    await page.getByRole("navigation", { name: "Mobile" }).getByRole("link", { name: /explore events/i }).click();
  } else {
    await page.getByRole("banner").getByRole("link", { name: /explore events/i }).click();
  }
  await expect(page).toHaveURL(/\/events$/);
});

test("home hero CTAs and skip link work", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /discover what's next/i }).click();
  await expect(page).toHaveURL(/\/events$/);
  await page.goto("/");
  await page.getByRole("main").getByRole("link", { name: /^our experience$/i }).click();
  await expect(page).toHaveURL(/\/experiences$/);
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
});

test("footer links work", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await footer.getByRole("link", { name: "Refund policy" }).click();
  await expect(page).toHaveURL(/\/refunds$/);
});

test("header fits on small phones: brand name not clipped, CTA hidden", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile only");
  await page.goto("/");
  const banner = page.getByRole("banner");
  await expect(banner.getByRole("link", { name: /explore events/i })).toBeHidden();
  const clipped = await banner.locator("a[aria-label='PynkPours — home'] span").evaluate((el) => el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > window.innerWidth);
  expect(clipped).toBe(false);
});

test("footer newsletter field is usable width on desktop", async ({ page, isMobile }) => {
  test.skip(isMobile, "desktop only");
  await page.goto("/");
  const box = await page.getByRole("contentinfo").getByLabel("Email address").boundingBox();
  expect(box!.width).toBeGreaterThan(200);
});
