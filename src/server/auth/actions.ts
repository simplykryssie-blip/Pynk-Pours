"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { withinRateLimit } from "../request";
import { envSubset } from "../env";
import { serviceDb } from "../supabase";
import { sessionDb } from "./session";
import { homeFor, staffForAction, type StaffRole } from "./staff";

export interface AuthState {
  status: "idle" | "error" | "success" | "enrolling";
  message?: string;
  factorId?: string;
  qrCode?: string;
  secret?: string;
}

const GENERIC_LOGIN_ERROR = "Incorrect email or password.";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(200),
});

export async function signIn(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { status: "error", message: GENERIC_LOGIN_ERROR };
  if (!(await withinRateLimit("admin-login", 10, 600)) || !(await withinRateLimit("admin-login-email", 5, 600, parsed.data.email))) {
    return { status: "error", message: "Too many sign-in attempts. Please wait 10 minutes and try again." };
  }

  const db = await sessionDb();
  const { data, error } = await db.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { status: "error", message: GENERIC_LOGIN_ERROR };

  // Only active staff may hold a session. Same message as a wrong password (no enumeration).
  const { data: profile } = await serviceDb()
    .from("admin_profiles").select("is_active").eq("user_id", data.user.id).maybeSingle();
  if (!profile?.is_active) {
    await db.auth.signOut();
    return { status: "error", message: GENERIC_LOGIN_ERROR };
  }

  const { data: factors } = await db.auth.mfa.listFactors();
  redirect(factors?.totp?.some((f) => f.status === "verified") ? "/admin/mfa" : "/admin/mfa/setup");
}

const codeSchema = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app.");

async function landingAfterMfa(): Promise<string> {
  const db = await sessionDb();
  const { data: role } = await db.rpc("current_staff_role");
  return role ? homeFor(role as StaffRole) : "/admin/login?error=access";
}

/** Second step: verify a code from an already-enrolled authenticator. */
export async function verifyMfa(_prev: AuthState, form: FormData): Promise<AuthState> {
  const code = codeSchema.safeParse(form.get("code"));
  if (!code.success) return { status: "error", message: code.error.issues[0].message };
  if (!(await withinRateLimit("admin-mfa", 10, 600))) {
    return { status: "error", message: "Too many attempts. Please wait 10 minutes and try again." };
  }
  const db = await sessionDb();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: factors } = await db.auth.mfa.listFactors();
  const factor = factors?.totp?.find((f) => f.status === "verified");
  if (!factor) redirect("/admin/mfa/setup");
  const { error } = await db.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.data });
  if (error) return { status: "error", message: "That code didn't work. Check your app and try again." };
  redirect(await landingAfterMfa());
}

/** First-time setup: create a new (unverified) TOTP factor and show its QR code. */
export async function startEnrollment(): Promise<AuthState> {
  const db = await sessionDb();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: factors } = await db.auth.mfa.listFactors();
  if (factors?.totp?.some((f) => f.status === "verified")) redirect("/admin/mfa");
  // Remove abandoned, unverified attempts so they don't accumulate.
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") await db.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await db.auth.mfa.enroll({ factorType: "totp", friendlyName: `PynkPours ${Date.now()}` });
  if (error || !data) return { status: "error", message: "Couldn't start authenticator setup. Please try again." };
  return { status: "enrolling", factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function confirmEnrollment(prev: AuthState, form: FormData): Promise<AuthState> {
  const code = codeSchema.safeParse(form.get("code"));
  const factorId = String(form.get("factorId") ?? "");
  if (!code.success) return { ...prev, status: "enrolling", message: code.error.issues[0].message };
  if (!(await withinRateLimit("admin-mfa", 10, 600))) {
    return { ...prev, status: "enrolling", message: "Too many attempts. Please wait 10 minutes and try again." };
  }
  const db = await sessionDb();
  const { error } = await db.auth.mfa.challengeAndVerify({ factorId, code: code.data });
  if (error) return { ...prev, status: "enrolling", message: "That code didn't work. Make sure your phone's clock is correct and try again." };
  redirect(await landingAfterMfa());
}

export async function signOut(): Promise<void> {
  const db = await sessionDb();
  await db.auth.signOut();
  redirect("/admin/login?signedOut=1");
}

const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128)
  .regex(/[a-z]/, "Include a lowercase letter.")
  .regex(/[A-Z]/, "Include an uppercase letter.")
  .regex(/\d/, "Include a number.");

export async function changePassword(_prev: AuthState, form: FormData): Promise<AuthState> {
  const staff = await staffForAction(["owner", "admin", "checkin"]);
  if ("error" in staff) return { status: "error", message: staff.error };
  const pw = passwordSchema.safeParse(form.get("password"));
  if (!pw.success) return { status: "error", message: pw.error.issues[0].message };
  if (pw.data !== form.get("confirm")) return { status: "error", message: "The passwords don't match." };
  const { error } = await staff.db.auth.updateUser({ password: pw.data });
  if (error) return { status: "error", message: "Couldn't update your password. Please try again." };
  return { status: "success", message: "Your password has been updated." };
}

// ---------------------------------------------------------------------------
// Password reset (email link). Same generic answer whether or not the email
// exists. The link opens /admin/auth/recovery, which starts a short recovery
// session. If an authenticator is enrolled, the new password also needs a code.
// ---------------------------------------------------------------------------

const RESET_SENT =
  "If that email belongs to a PynkPours staff account, a reset link is on its way. It expires in 1 hour. Open it on this device, in this browser.";

/** Base URL that staff use (the admin host when configured). */
function staffBaseUrl(): string {
  const adminHost = process.env.ADMIN_HOST?.trim().toLowerCase();
  if (adminHost && /^[a-z0-9.-]+$/.test(adminHost)) return `https://${adminHost}`;
  return envSubset(["NEXT_PUBLIC_SITE_URL"]).NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
}

export async function requestPasswordReset(_prev: AuthState, form: FormData): Promise<AuthState> {
  const email = z.string().trim().toLowerCase().pipe(z.email()).safeParse(form.get("email"));
  if (!email.success) return { status: "error", message: "Enter the email address you sign in with." };
  if (!(await withinRateLimit("admin-reset", 5, 3600)) || !(await withinRateLimit("admin-reset-email", 3, 3600, email.data))) {
    return { status: "error", message: "Too many reset requests. Please wait an hour and try again." };
  }
  const db = await sessionDb();
  const { error } = await db.auth.resetPasswordForEmail(email.data, { redirectTo: `${staffBaseUrl()}/admin/auth/recovery` });
  if (error) console.error(`[password-reset] request failed: ${error.message}`);
  return { status: "success", message: RESET_SENT };
}

export async function completePasswordReset(_prev: AuthState, form: FormData): Promise<AuthState> {
  const db = await sessionDb();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return { status: "error", message: "This reset link has expired. Request a new one." };

  const { data: profile } = await serviceDb()
    .from("admin_profiles").select("is_active").eq("user_id", user.id).maybeSingle();
  if (!profile?.is_active) {
    await db.auth.signOut();
    return { status: "error", message: "This account can't sign in. Contact the PynkPours owner." };
  }

  const pw = passwordSchema.safeParse(form.get("password"));
  if (!pw.success) return { status: "error", message: pw.error.issues[0].message };
  if (pw.data !== form.get("confirm")) return { status: "error", message: "The passwords don't match." };

  const { data: factors } = await db.auth.mfa.listFactors();
  const factor = factors?.totp?.find((f) => f.status === "verified");
  if (factor) {
    const { data: aal } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== "aal2") {
      const code = codeSchema.safeParse(form.get("code"));
      if (!code.success) return { status: "error", message: code.error.issues[0].message };
      if (!(await withinRateLimit("admin-mfa", 10, 600))) {
        return { status: "error", message: "Too many attempts. Please wait 10 minutes and try again." };
      }
      const { error } = await db.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.data });
      if (error) return { status: "error", message: "That code didn't work. Check your app and try again." };
    }
  }

  const { error } = await db.auth.updateUser({ password: pw.data });
  if (error) {
    return {
      status: "error",
      message: error.code === "same_password"
        ? "Choose a password different from your current one."
        : "Couldn't update your password. Request a new reset link and try again.",
    };
  }
  await db.auth.signOut();
  redirect("/admin/login?reset=1");
}
