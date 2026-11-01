/**
 * Staff password reset by email, end to end, against the LOCAL Supabase stack.
 * Emails are captured by the local mail server (Mailpit on 127.0.0.1:54324);
 * nothing is sent to real addresses.
 */
import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { signInFully, STAFF } from "./admin-auth";
import { localDb, resetRateLimits } from "./support";
import { totp } from "./totp";

const MAILPIT = "http://127.0.0.1:54324";
const NEW_PASSWORD = "Reset-Flow-Check-2026";

async function clearMail() {
  await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
}

async function latestResetLink(to: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/messages`)).json() as {
      messages: { ID: string; To: { Address: string }[] }[];
    };
    const msg = list.messages.find((m) => m.To.some((t) => t.Address.toLowerCase() === to));
    if (msg) {
      const full = await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json() as { HTML: string; Text: string };
      const link = (full.HTML + full.Text).match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/)?.[0];
      if (link) return link.replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No reset email for ${to}`);
}

function secretFor(email: string): string {
  const file = "test-results/.admin-auth/secrets.json";
  const s = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, string>) : {};
  if (!s[email]) throw new Error(`No authenticator secret recorded for ${email}`);
  return s[email];
}

test.describe("password reset", () => {
  test.beforeEach(({ isMobile }) => test.skip(isMobile, "sends email + changes a password: runs once (desktop)"));

  test("sign-in page links to reset; unknown emails get the same generic answer", async ({ page }) => {
    await resetRateLimits();
    await page.goto("/admin/login");
    await page.getByRole("link", { name: "Forgot your password?" }).click();
    await expect(page).toHaveURL(/\/admin\/forgot-password$/);
    await page.getByRole("textbox", { name: "Email" }).fill("nobody-here@example.test");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toContainText("If that email belongs to a PynkPours staff account");
  });

  test("an expired or bogus link is refused", async ({ page }) => {
    await page.goto("/admin/auth/recovery?code=not-a-real-code");
    await expect(page).toHaveURL(/\/admin\/forgot-password\?error=expired$/);
    await expect(page.getByRole("status")).toContainText("expired");
    await page.goto("/admin/reset-password");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Link expired");
  });

  test("email link + authenticator code sets a new password; the old one stops working", async ({ page, context }) => {
    test.setTimeout(120_000);
    const { email, password: original } = STAFF.checkin;
    // Make sure the account has an authenticator we know the secret for.
    await signInFully(page, "checkin");
    await context.clearCookies();

    try {
      await resetRateLimits();
      await clearMail();
      await page.goto("/admin/forgot-password");
      await page.getByRole("textbox", { name: "Email" }).fill(email);
      await page.getByRole("button", { name: "Send reset link" }).click();
      await expect(page.getByRole("status")).toContainText("reset link is on its way");

      await page.goto(await latestResetLink(email));
      await expect(page).toHaveURL(/\/admin\/reset-password$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Choose a new password");

      await page.locator("#new-password").fill(NEW_PASSWORD);
      await page.locator("#confirm-password").fill(NEW_PASSWORD);
      // An enrolled authenticator is required: email access alone is not enough.
      const code = page.getByLabel("6-digit code");
      await expect(code).toBeVisible();
      await page.waitForTimeout(31_000 - (Date.now() % 30_000)); // fresh TOTP window (codes are single-use)
      await code.fill(totp(secretFor(email)));
      await page.getByRole("button", { name: "Save new password" }).click();

      await expect(page).toHaveURL(/\/admin\/login\?reset=1$/);
      await expect(page.getByRole("status")).toContainText("Your password has been updated");

      // Old password refused, new one accepted (lands on the authenticator step).
      await resetRateLimits();
      await page.getByRole("textbox", { name: "Email" }).fill(email);
      await page.getByLabel("Password", { exact: true }).fill(original);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.locator("form").getByRole("alert")).toHaveText("Incorrect email or password.");
      await page.getByRole("textbox", { name: "Email" }).fill(email);
      await page.getByLabel("Password", { exact: true }).fill(NEW_PASSWORD);
      await page.getByRole("button", { name: "Sign in" }).click();
      await page.waitForURL(/\/admin\/mfa$/);
    } finally {
      // Restore the demo password for the other tests.
      await localDb((c) => c.query(
        "update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf')) where email = $1",
        [email, original],
      ));
      await resetRateLimits();
    }
  });
});
