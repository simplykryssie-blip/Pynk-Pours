import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { CustomPageEditor } from "@/components/admin/forms/CustomPageEditor";
import { OpButton } from "@/components/admin/forms/OpButton";
import { Card, Notice, PageHeader, smallButton, StatusBadge } from "@/components/admin/ui";
import { publicSiteUrl } from "@/lib/site-url";
import { requireStaff } from "@/server/auth/staff";
import { deleteCustomPage } from "@/server/admin/pages";

export const metadata: Metadata = { title: "Edit page" };

export default async function EditCustomPage({ params, searchParams }: PageProps<"/admin/policies/pages/[id]">) {
  const staff = await requireStaff(["owner", "admin"]);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data: page } = await staff.db.from("custom_pages")
    .select("id, title, slug, body, published, show_in_footer, footer_position").eq("id", id).maybeSingle();
  if (!page) notFound();
  const href = publicSiteUrl(`/policies/${page.slug}`);
  return (
    <AdminShell staff={staff}>
      <PageHeader
        title={page.title}
        back={{ href: "/admin/policies", label: "Policies" }}
        subtitle={<span className="inline-flex items-center gap-2"><StatusBadge status={page.published ? "active" : "inactive"} label={page.published ? "Published" : "Hidden"} /> /policies/{page.slug}</span>}
        actions={page.published ? <a href={href} target="_blank" rel="noopener" className={smallButton("secondary")}>View on website ↗</a> : undefined}
      />
      {sp.created === "1" && <div className="mb-4"><Notice tone="success">Page created{page.published ? " and published" : ". It&apos;s hidden until you tick Published and save"}.</Notice></div>}
      <Card>
        <CustomPageEditor siteUrl={publicSiteUrl("")} page={page} />
      </Card>
      <Card title="Delete this page" className="mt-6">
        <p className="mb-3 text-sm text-pp-black/70">To take the page off the website but keep it, untick Published instead. Deleting can&apos;t be undone (it stays in the activity log).</p>
        <OpButton action={deleteCustomPage} fields={{ id: page.id }} label="Delete page" variant="danger" pendingLabel="Deleting…"
          confirm={`Delete “${page.title}” permanently? Links to /policies/${page.slug} will stop working.`} />
      </Card>
    </AdminShell>
  );
}
