import type { Metadata } from "next";
import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card, EmptyState, PageHeader, smallButton, StatusBadge } from "@/components/admin/ui";
import { requireStaff } from "@/server/auth/staff";

export const metadata: Metadata = { title: "Forms" };

type Row = { id: string; title: string; slug: string; status: string; purpose: string; events: { title: string } | null; form_submissions: { status: string }[] };

export default async function FormsPage() {
  const staff = await requireStaff(["owner", "admin"]);
  const { data } = await staff.db.from("forms")
    .select("id, title, slug, status, purpose, events(title), form_submissions(status)").order("created_at", { ascending: false });
  const forms = (data ?? []) as unknown as Row[];
  return (
    <AdminShell staff={staff}>
      <PageHeader title="Forms" subtitle="Build forms like vendor applications, speaker requests or volunteer sign-ups, share the link, and review responses here."
        actions={<Link href="/admin/forms/new" className={smallButton("primary")}>+ New form</Link>} />
      {forms.length === 0 ? (
        <Card><EmptyState title="No forms yet">Start with “+ New form”. The vendor application template is ready to use.</EmptyState></Card>
      ) : (
        <ul className="space-y-3">
          {forms.map((f) => {
            const fresh = f.form_submissions.filter((s) => s.status === "new").length;
            return (
              <li key={f.id}>
                <Card>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <Link href={`/admin/forms/${f.id}`} className="font-semibold hover:text-pp-pink-strong">{f.title}</Link>
                      <p className="text-sm text-pp-black/65">/forms/{f.slug}{f.events ? ` · ${f.events.title}` : ""}{f.purpose === "vendor" ? " · Vendor application" : ""}</p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <StatusBadge status={f.status === "open" ? "active" : f.status === "closed" ? "closed" : "inactive"} label={f.status === "open" ? "Open" : f.status === "closed" ? "Closed" : "Draft"} />
                        {fresh > 0 && <StatusBadge status="pending" label={`${fresh} new`} />}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/admin/forms/${f.id}/responses`} className={smallButton("secondary")}>Responses ({f.form_submissions.length})</Link>
                      <Link href={`/admin/forms/${f.id}`} className={smallButton("secondary")} aria-label={`Edit ${f.title}`}>Edit</Link>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </AdminShell>
  );
}
