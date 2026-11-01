import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/admin/AuthCard";
import { MfaVerifyForm } from "@/components/admin/AuthForms";
import { signOut } from "@/server/auth/actions";
import { sessionDb } from "@/server/auth/session";

export const metadata: Metadata = { title: "Verify" };

export default async function MfaPage() {
  const db = await sessionDb();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: aal } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel !== "aal2") redirect("/admin/mfa/setup");
  if (aal.currentLevel === "aal2") redirect("/admin");
  return (
    <AuthCard title="Two-step verification" subtitle="Enter the code from your authenticator app">
      <MfaVerifyForm />
      <form action={signOut} className="text-center">
        <button type="submit" className="text-sm text-pp-cream/70 underline-offset-4 hover:underline">Cancel and sign out</button>
      </form>
    </AuthCard>
  );
}
