import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/admin/AuthCard";
import { ForgotPasswordForm } from "@/components/admin/AuthForms";

export const metadata: Metadata = { title: "Reset password" };

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/admin/forgot-password">) {
  const sp = await searchParams;
  const notice = sp.error === "expired" ? "That reset link has expired or was already used. Request a new one below." : undefined;
  return (
    <AuthCard title="Reset your password" subtitle="We'll email you a link to choose a new one">
      <ForgotPasswordForm notice={notice} />
      <p className="text-center text-sm">
        <Link href="/admin/login" className="text-pp-cream/80 underline-offset-4 hover:underline">Back to sign in</Link>
      </p>
    </AuthCard>
  );
}
