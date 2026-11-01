import type { Metadata } from "next";
import { AuthCard } from "@/components/admin/AuthCard";
import { LoginForm } from "@/components/admin/AuthForms";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  const sp = await searchParams;
  const notice = sp.reset ? "Your password has been updated. Sign in with your new password." : sp.signedOut ? "You've been signed out." : sp.error === "access" ? "Your account doesn't have access. Contact the PynkPours owner." : undefined;
  return (
    <AuthCard title="Staff sign in" subtitle="PynkPours team members only">
      <LoginForm notice={notice} />
    </AuthCard>
  );
}
