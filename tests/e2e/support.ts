import { expect, type Page } from "@playwright/test";
import { Client } from "pg";

const LOCAL_DB = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** Direct access to the LOCAL Supabase database for assertions and resets. */
export async function localDb<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: LOCAL_DB });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

export const resetRateLimits = () => localDb((c) => c.query("delete from public.rate_limits"));

/** Fails the test on console errors / failed requests / CSP violations. */
export function watchConsole(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => {
    // Aborted prefetches during navigation are normal.
    if (!/net::ERR_ABORTED/.test(r.failure()?.errorText ?? "")) problems.push(`requestfailed: ${r.url()}`);
  });
  return problems;
}

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > w + 1 && getComputedStyle(el).position !== "fixed";
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
    return { scroll: document.documentElement.scrollWidth, w, offenders };
  });
  expect(overflow.offenders, `elements overflow the viewport (${overflow.scroll} > ${overflow.w})`).toEqual([]);
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.w);
}

/** Forms reject submissions made faster than a human could (anti-spam). */
export const humanPause = (page: Page) => page.waitForTimeout(2700);

/** Waits until the client menu has hydrated (the fallback button has no aria-controls). */
export async function openMobileMenu(page: Page) {
  const toggle = page.getByRole("button", { name: "Open menu" });
  await expect(toggle).toHaveAttribute("aria-controls", /.+/);
  await toggle.click();
}
