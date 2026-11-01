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

/**
 * Rate limits use fixed windows aligned to the database clock. A test that makes
 * several requests must not straddle a window boundary, or the counter resets
 * mid-test. If fewer than `marginSeconds` remain in the current window, wait for
 * the next one to start.
 */
export async function avoidRateLimitWindowEdge(windowSeconds: number, marginSeconds = 90) {
  const remaining = await localDb(async (c) => {
    const { rows } = await c.query(
      "select $1::int - mod(floor(extract(epoch from now()))::int, $1::int) as s", [windowSeconds]);
    return Number(rows[0].s);
  });
  if (remaining < marginSeconds) await new Promise((r) => setTimeout(r, (remaining + 1) * 1000));
}

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
        if (!(r.width > 0 && r.right > w + 1) || getComputedStyle(el).position === "fixed") return false;
        // Content inside an intentional horizontal scroll region (wide tables) is fine.
        for (let p = el.parentElement; p; p = p.parentElement) {
          const ox = getComputedStyle(p).overflowX;
          if (ox === "auto" || ox === "scroll") return false;
        }
        return true;
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
