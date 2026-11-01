import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/admin/AuthCard";
import { ResetPasswordForm } from "@/components/admin/AuthForms";
import { sessionDb } from "@/server/auth/session";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  const db = await sessionDb();
  const { data: { user } } = await db.auth.getUser();
  if (!user) {
    return (
      <AuthCard title="Link expired" subtitle="This reset link has expired or was already used">
        <p className="text-center text-sm">
          <Link href="/admin/forgot-password" className="text-pp-pink underline-offset-4 hover:underline">Request a new reset link</Link>
        </p>
      </AuthCard>
    );
  }
  const { data: factors } = await db.auth.mfa.listFactors();
  const { data: aal } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
  const needsCode = Boolean(factors?.totp?.some((f) => f.status === "verified")) && aal?.currentLevel !== "aal2";
  return (
    <AuthCard title="Choose a new password" subtitle={user.email ?? undefined}>
      <ResetPasswordForm needsCode={needsCode} />
    </AuthCard>
  );
}
