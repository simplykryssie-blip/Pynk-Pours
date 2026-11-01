import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { OpButton } from "@/components/admin/forms/OpButton";
import { CreateStaffForm, StaffRoleForm } from "@/components/admin/forms/SmallForms";
import { ROLE_LABEL } from "@/components/admin/nav";
import { Card, PageHeader, StatusBadge } from "@/components/admin/ui";
import { staffOperation } from "@/server/admin/people";
import { requireStaff, type StaffRole } from "@/server/auth/staff";
import { serviceDb } from "@/server/supabase";

export const metadata: Metadata = { title: "Staff" };

export default async function StaffPage() {
  const staff = await requireStaff(["owner"]);
  const { data: profiles } = await staff.db.from("admin_profiles").select("user_id, display_name, role, is_active, created_at").order("created_at");
  // Emails come from Supabase Auth (owner-only page; server-side only).
  const { data: users } = await serviceDb().auth.admin.listUsers({ perPage: 1000 });
  const emails = new Map((users?.users ?? []).map((u) => [u.id, { email: u.email, mfa: (u.factors ?? []).some((f) => f.status === "verified"), last: u.last_sign_in_at }]));
  return (
    <AdminShell staff={staff}>
      <PageHeader title="Staff" subtitle="Everyone who can sign in to the PynkPours dashboard. All staff must use an authenticator app." />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Team">
          <ul className="space-y-4">
            {(profiles ?? []).map((p) => {
              const info = emails.get(p.user_id);
              const self = p.user_id === staff.user.id;
              return (
                <li key={p.user_id} className="space-y-3 rounded-sm border border-pp-black/10 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{p.display_name ?? info?.email}</p>
                    <StatusBadge status={p.is_active ? "active" : "inactive"} label={p.is_active ? ROLE_LABEL[p.role as StaffRole] : "No access"} />
                    {!info?.mfa && <StatusBadge status="pending" label="Authenticator not set up" />}
                    {self && <span className="text-xs text-pp-black/60">(you)</span>}
                  </div>
                  <p className="text-sm text-pp-black/70">{info?.email}</p>
                  {!self && (
                    <div className="space-y-3">
                      <StaffRoleForm userId={p.user_id} role={p.role} />
                      <div className="flex flex-wrap gap-2">
                        {p.is_active
                          ? <OpButton action={staffOperation} fields={{ user_id: p.user_id, op: "deactivate" }} label="Remove access" variant="danger" confirm="Remove this person's access to the dashboard?" />
                          : <OpButton action={staffOperation} fields={{ user_id: p.user_id, op: "activate" }} label="Restore access" />}
                        <OpButton action={staffOperation} fields={{ user_id: p.user_id, op: "reset_mfa" }} label="Reset authenticator" confirm="Reset their authenticator? They'll set up a new one at next sign-in (e.g. after a lost phone)." />
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
        <Card title="Add a staff member">
          <p className="mb-4 text-sm text-pp-black/70"><strong>Check-in staff</strong> can only look up and check in guests — they can&apos;t see sales, orders or edit events.</p>
          <CreateStaffForm />
        </Card>
      </div>
    </AdminShell>
  );
}
