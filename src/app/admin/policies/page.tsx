import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { PolicyEditor } from "@/components/admin/forms/PolicyEditor";
import Link from "next/link";
import { Card, EmptyState, Notice, PageHeader, smallButton, StatusBadge } from "@/components/admin/ui";
import { DEFAULT_POLICIES, POLICY_SLUGS } from "@/content/policies";
import { publicSiteUrl } from "@/lib/site-url";
import { requireStaff } from "@/server/auth/staff";
import { getPolicy } from "@/server/data/pages";

export const metadata: Metadata = { title: "Policies" };

const PATHS = { privacy: "/privacy", terms: "/terms", refunds: "/refunds" } as const;

export default async function PoliciesPage({ searchParams }: PageProps<"/admin/policies">) {
  const staff = await requireStaff(["owner", "admin"]);
  const [policies, { data: custom }, sp] = await Promise.all([
    Promise.all(POLICY_SLUGS.map((slug) => getPolicy(slug))),
    staff.db.from("custom_pages").select("id, title, slug, published, show_in_footer, updated_at").order("footer_position").order("title"),
    searchParams,
  ]);
  type Row = { id: string; title: string; slug: string; published: boolean; show_in_footer: boolean; updated_at: string };
  return (
    <AdminShell staff={staff}>
      <PageHeader
        title="Policies"
        subtitle="Edit the Privacy Policy, Terms of Use and Refund Policy, and add your own pages. Changes go live as soon as you publish, and every change is recorded in the activity log."
        actions={<Link href="/admin/policies/new" className={smallButton("primary")}>+ New page</Link>}
      />
      {sp.deleted === "1" && <div className="mb-4"><Notice tone="success">Page deleted.</Notice></div>}
      <Card region title="Your pages" className="mb-6">
        {((custom ?? []) as Row[]).length === 0 ? (
          <EmptyState title="No extra pages yet">Use “+ New page” for things like a Code of Conduct or Photo Policy.</EmptyState>
        ) : (
          <ul className="divide-y divide-pp-black/10">
            {((custom ?? []) as Row[]).map((p) => (
              <li key={p.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Link href={`/admin/policies/pages/${p.id}`} className="font-semibold hover:text-pp-pink-strong">{p.title}</Link>
                  <p className="text-sm text-pp-black/60">/policies/{p.slug}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={p.published ? "active" : "inactive"} label={p.published ? "Published" : "Hidden"} />
                  {p.published && p.show_in_footer && <StatusBadge status="valid" label="In footer" />}
                  <Link href={`/admin/policies/pages/${p.id}`} className={smallButton("secondary")} aria-label={`Edit ${p.title}`}>Edit</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <div className="space-y-6">
        {policies.map((p) => (
          <Card
            key={p.slug}
            region
            title={p.title}
            actions={<span className="text-xs text-pp-black/60">{p.edited ? `Last published ${p.updated}` : "Original draft (not yet edited)"}</span>}
          >
            <PolicyEditor slug={p.slug} title={p.title} text={p.text} defaultText={DEFAULT_POLICIES[p.slug].text} viewHref={publicSiteUrl(PATHS[p.slug])} />
          </Card>
        ))}
      </div>
    </AdminShell>
  );
}
