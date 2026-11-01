import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/admin/AuthCard";
import { MfaEnrollForm } from "@/components/admin/AuthForms";
import { signOut } from "@/server/auth/actions";
import { sessionDb } from "@/server/auth/session";

export const metadata: Metadata = { title: "Set up two-step verification" };

export default async function MfaSetupPage() {
  const db = await sessionDb();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: aal } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2") redirect(aal.currentLevel === "aal2" ? "/admin" : "/admin/mfa");
  return (
    <AuthCard title="Protect your account" subtitle="Two-step verification is required for all PynkPours staff">
      <MfaEnrollForm />
      <form action={signOut} className="text-center">
        <button type="submit" className="text-sm text-pp-cream/70 underline-offset-4 hover:underline">Cancel and sign out</button>
      </form>
    </AuthCard>
  );
}
