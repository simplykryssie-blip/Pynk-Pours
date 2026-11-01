import { mkdirSync } from "node:fs";
import type { Page } from "@playwright/test";

/** Returns a function that shows a numbered caption bar (visible in video + screenshots), then captures. */
export function shooter(OUT: string, prefix = "") {
  mkdirSync(OUT, { recursive: true });
  let step = 0;
  return async function shot(page: Page, caption: string, opts: { fullPage?: boolean } = {}) {
    const text = prefix + caption;
    step += 1;
    await page.evaluate(({ text, n }) => {
      document.getElementById("demo-caption")?.remove();
      const el = document.createElement("div");
      el.id = "demo-caption";
      el.textContent = `${n}. ${text}`;
      Object.assign(el.style, {
        position: "fixed", left: "50%", bottom: "16px", transform: "translateX(-50%)", zIndex: "99999",
        background: "rgba(11,11,11,.92)", color: "#f7f1ed", padding: "10px 18px", borderRadius: "6px",
        font: "600 15px system-ui, sans-serif", border: "1px solid #c8a45d", maxWidth: "92vw", textAlign: "center",
        pointerEvents: "none",
      });
      document.body.appendChild(el);
    }, { text, n: step });
    await page.waitForTimeout(900);
    const name = caption.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
    await page.screenshot({ path: `${OUT}/${String(step).padStart(2, "0")}-${name}.png`, fullPage: opts.fullPage });
  };
}
