import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card, EmptyState, Notice, PageHeader, smallButton, StatusBadge } from "@/components/admin/ui";
import { formatEventDate } from "@/lib/datetime";
import { STATUS_BADGE, statusLabel, SUBMISSION_STATUSES } from "@/lib/forms";
import { requireStaff } from "@/server/auth/staff";

export const metadata: Metadata = { title: "Responses" };

export default async function Responses({ params, searchParams }: PageProps<"/admin/forms/[id]/responses">) {
  const staff = await requireStaff(["owner", "admin"]);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const status = SUBMISSION_STATUSES.some((s) => s.value === sp.status) ? String(sp.status) : "";
  let q = staff.db.from("form_submissions").select("id, name, email, status, created_at").eq("form_id", id).order("created_at", { ascending: false }).limit(500);
  if (status) q = q.eq("status", status);
  const [{ data: form }, { data: rows }] = await Promise.all([
    staff.db.from("forms").select("id, title").eq("id", id).maybeSingle(), q,
  ]);
  if (!form) notFound();
  const list = (rows ?? []) as { id: string; name: string | null; email: string; status: string; created_at: string }[];
  return (
    <AdminShell staff={staff}>
      <PageHeader title={`Responses: ${form.title}`} back={{ href: `/admin/forms/${id}`, label: form.title }}
        actions={<a href={`/admin/forms/${id}/export`} className={smallButton("secondary")}>Download CSV</a>} />
      {sp.deleted === "1" && <div className="mb-4"><Notice tone="success">Response deleted.</Notice></div>}
      <nav aria-label="Filter by status" className="mb-4 flex flex-wrap gap-2">
        <Link href={`/admin/forms/${id}/responses`} aria-current={!status ? "page" : undefined} className={smallButton(!status ? "primary" : "secondary")}>All</Link>
        {SUBMISSION_STATUSES.map((s) => (
          <Link key={s.value} href={`/admin/forms/${id}/responses?status=${s.value}`} aria-current={status === s.value ? "page" : undefined}
            className={smallButton(status === s.value ? "primary" : "secondary")}>{s.label}</Link>
        ))}
      </nav>
      {list.length === 0 ? <Card><EmptyState title="No responses yet">Share the form link to start collecting responses.</EmptyState></Card> : (
        <ul className="space-y-2">
          {list.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/forms/responses/${r.id}`} className="flex flex-col gap-1 rounded-sm border border-pp-black/10 bg-white p-4 hover:border-pp-pink-strong sm:flex-row sm:items-center sm:justify-between">
                <span><strong>{r.name ?? r.email}</strong>{r.name && <span className="block text-sm text-pp-black/65">{r.email}</span>}</span>
                <span className="flex items-center gap-3 text-sm">
                  <StatusBadge status={STATUS_BADGE[r.status]} label={statusLabel(r.status)} />
                  <span className="text-pp-black/65">{formatEventDate(r.created_at, "America/Chicago")}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
