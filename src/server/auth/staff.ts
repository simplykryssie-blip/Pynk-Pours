import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { sessionDb } from "./session";

export type StaffRole = "owner" | "admin" | "checkin";

export interface Staff {
  user: User;
  role: StaffRole;
  displayName: string;
  db: SupabaseClient;
  /** Owner/admin: may see money and manage events. */
  canManage: boolean;
}

/** Where each role lands after sign-in. */
export const homeFor = (role: StaffRole) => (role === "checkin" ? "/admin/check-in" : "/admin");

/**
 * Gate for every admin page and server action. Order of checks:
 *  1. a valid Supabase user (verified with the auth server, not just the cookie)
 *  2. an MFA-verified session (aal2) — otherwise send to the authenticator step
 *  3. an active staff role, resolved BY THE DATABASE (which itself requires aal2)
 *  4. the role is allowed for this page
 */
export async function requireStaff(allowed: StaffRole[] = ["owner", "admin", "checkin"]): Promise<Staff> {
  const db = await sessionDb();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/admin/login");

  const { data: aal } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") {
    redirect(aal?.nextLevel === "aal2" ? "/admin/mfa" : "/admin/mfa/setup");
  }

  const { data: role, error } = await db.rpc("current_staff_role");
  if (error || !role) {
    await db.auth.signOut();
    redirect("/admin/login?error=access");
  }
  if (!allowed.includes(role as StaffRole)) redirect(`${homeFor(role as StaffRole)}?error=forbidden`);

  const { data: profile } = await db.from("admin_profiles").select("display_name").eq("user_id", user.id).maybeSingle();
  return {
    user,
    role: role as StaffRole,
    displayName: profile?.display_name ?? user.email ?? "Staff",
    db,
    canManage: role === "owner" || role === "admin",
  };
}

/** For server actions: same checks, but returns an error instead of redirecting mid-action. */
export async function staffForAction(allowed: StaffRole[]): Promise<Staff | { error: string }> {
  try {
    return await requireStaff(allowed);
  } catch (e) {
    // redirect() throws a special error — translate to an action error.
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) {
      return { error: "Your session has expired or you don't have permission. Please sign in again." };
    }
    throw e;
  }
}
