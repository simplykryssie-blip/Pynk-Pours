import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { localDb, resetRateLimits } from "./support";
import { totp } from "./totp";

/** Demo staff created locally by scripts/create-staff.mts (see QA report). */
export const STAFF = {
  owner: { email: "owner@pynkpours.test", password: "DemoOwner-Local-2026" },
  checkin: { email: "door@pynkpours.test", password: "DemoDoor-Local-2026" },
} as const;

const DIR = "test-results/.admin-auth";
const secretsFile = `${DIR}/secrets.json`;
const readSecrets = (): Record<string, string> => (existsSync(secretsFile) ? JSON.parse(readFileSync(secretsFile, "utf8")) : {});
const saveSecret = (email: string, secret: string) => {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(secretsFile, JSON.stringify({ ...readSecrets(), [email]: secret }));
};

/** Remove a user's authenticator (local DB) so a test can run the first-time setup. */
export async function resetMfa(email: string) {
  await localDb((c) => c.query("delete from auth.mfa_factors where user_id = (select id from auth.users where email = $1)", [email]));
  const s = readSecrets();
  delete s[email];
  mkdirSync(DIR, { recursive: true });
  writeFileSync(secretsFile, JSON.stringify(s));
}

/** Enter a TOTP code; retries once in the next 30s window if a code was just used. */
async function enterCode(page: Page, secret: string, button: string) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByLabel("6-digit code").fill(totp(secret));
    await page.getByRole("button", { name: button }).click();
    const ok = await page.waitForURL((u) => !/\/admin\/mfa/.test(u.pathname), { timeout: 8000 }).then(() => true, () => false);
    if (ok) return;
    await page.waitForTimeout(31_000 - (Date.now() % 30_000));
  }
  throw new Error("MFA verification failed twice");
}

/** Password + authenticator sign-in exactly as a person would do it. */
export async function signInFully(page: Page, who: keyof typeof STAFF) {
  const { email, password } = STAFF[who];
  await resetRateLimits();
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin\/mfa/);
  if (/\/admin\/mfa\/setup/.test(page.url())) {
    await page.getByRole("button", { name: "Set up authenticator" }).click();
    await page.getByText("Can't scan?").click();
    const secret = (await page.getByTestId("totp-secret").textContent())!.trim();
    saveSecret(email, secret);
    await enterCode(page, secret, "Confirm and continue");
  } else {
    const secret = readSecrets()[email];
    if (!secret) {
      // Unknown authenticator from an earlier run: reset it and enrol again.
      await resetMfa(email);
      return signInFully(page, who);
    }
    await enterCode(page, secret, "Verify");
  }
  await expect(page).toHaveURL(/\/admin(\/check-in)?$/);
}

/** Reuse a saved MFA-verified session when possible (faster), else sign in fully. */
export async function asStaff(page: Page, who: keyof typeof STAFF) {
  const file = `${DIR}/${who}-state.json`;
  if (existsSync(file)) {
    await page.context().addCookies(JSON.parse(readFileSync(file, "utf8")).cookies);
    await page.goto("/admin/account");
    if (/\/admin\/account$/.test(page.url())) return;
  }
  await signInFully(page, who);
  mkdirSync(DIR, { recursive: true });
  await page.context().storageState({ path: file });
}
