import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { ChangePasswordForm } from "@/components/admin/forms/SmallForms";
import { ROLE_LABEL } from "@/components/admin/nav";
import { Card, PageHeader } from "@/components/admin/ui";
import { requireStaff } from "@/server/auth/staff";

export const metadata: Metadata = { title: "My account" };

export default async function AccountPage() {
  const staff = await requireStaff();
  return (
    <AdminShell staff={staff}>
      <PageHeader title="My account" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Profile">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-pp-black/60">Name</dt><dd>{staff.displayName}</dd>
            <dt className="text-pp-black/60">Email</dt><dd>{staff.user.email}</dd>
            <dt className="text-pp-black/60">Role</dt><dd>{ROLE_LABEL[staff.role]}</dd>
            <dt className="text-pp-black/60">Two-step verification</dt><dd>On (authenticator app)</dd>
          </dl>
          <p className="mt-4 text-xs text-pp-black/60">Lost your phone? Ask the owner to reset your authenticator from the Staff page.</p>
        </Card>
        <Card title="Change password"><ChangePasswordForm /></Card>
      </div>
    </AdminShell>
  );
}
