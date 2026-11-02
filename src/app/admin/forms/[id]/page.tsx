import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { FormBuilder, type BuilderForm } from "@/components/admin/forms/FormBuilder";
import { Notice, PageHeader, smallButton } from "@/components/admin/ui";
import { publicSiteUrl } from "@/lib/site-url";
import { requireStaff } from "@/server/auth/staff";

export const metadata: Metadata = { title: "Edit form" };

export default async function EditForm({ params, searchParams }: PageProps<"/admin/forms/[id]">) {
  const staff = await requireStaff(["owner", "admin"]);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [{ data: form }, { data: events }, { count }] = await Promise.all([
    staff.db.from("forms").select("id, title, slug, description, confirmation_message, status, event_id, closes_at, notify_staff, purpose, fields").eq("id", id).maybeSingle(),
    staff.db.from("events").select("id, title").neq("status", "archived").order("starts_at", { ascending: false, nullsFirst: true }).limit(100),
    staff.db.from("form_submissions").select("id", { count: "exact", head: true }).eq("form_id", id),
  ]);
  if (!form) notFound();
  const f = form as BuilderForm;
  return (
    <AdminShell staff={staff}>
      <PageHeader title={f.title} back={{ href: "/admin/forms", label: "Forms" }}
        subtitle={f.purpose === "vendor" ? "Vendor application" : "Form"}
        actions={<>
          <Link href={`/admin/forms/${f.id}/responses`} className={smallButton("secondary")}>Responses ({count ?? 0})</Link>
          {f.status !== "draft" && <a href={publicSiteUrl(`/forms/${f.slug}`)} target="_blank" rel="noopener" className={smallButton("secondary")}>View form ↗</a>}
        </>} />
      {sp.created === "1" && <div className="mb-4"><Notice tone="success">Form created as a draft. Edit the questions, then set the status to Open and save to publish it.</Notice></div>}
      <FormBuilder form={f} events={(events ?? []) as { id: string; title: string }[]} siteUrl={publicSiteUrl("")} />
    </AdminShell>
  );
}
