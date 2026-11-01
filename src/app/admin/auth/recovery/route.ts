import { NextResponse, type NextRequest } from "next/server";
import { sessionDb } from "@/server/auth/session";

/**
 * Landing point for the password-reset email. Exchanges the one-time link for a
 * short recovery session (PKCE `code`, or `token_hash` if the email template is
 * customised), then shows the "choose a new password" form.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const db = await sessionDb();
  let ok = false;
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  if (code) {
    ok = !(await db.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && params.get("type") === "recovery") {
    ok = !(await db.auth.verifyOtp({ type: "recovery", token_hash: tokenHash })).error;
  }
  const dest = request.nextUrl.clone();
  dest.search = "";
  dest.pathname = ok ? "/admin/reset-password" : "/admin/forgot-password";
  if (!ok) dest.searchParams.set("error", "expired");
  const res = NextResponse.redirect(dest);
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
