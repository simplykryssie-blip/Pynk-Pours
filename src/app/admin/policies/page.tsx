import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { PolicyEditor } from "@/components/admin/forms/PolicyEditor";
import { Card, PageHeader } from "@/components/admin/ui";
import { DEFAULT_POLICIES, POLICY_SLUGS } from "@/content/policies";
import { publicSiteUrl } from "@/lib/site-url";
import { requireStaff } from "@/server/auth/staff";
import { getPolicy } from "@/server/data/pages";

export const metadata: Metadata = { title: "Policies" };

const PATHS = { privacy: "/privacy", terms: "/terms", refunds: "/refunds" } as const;

export default async function PoliciesPage() {
  const staff = await requireStaff(["owner", "admin"]);
  const policies = await Promise.all(POLICY_SLUGS.map((slug) => getPolicy(slug)));
  return (
    <AdminShell staff={staff}>
      <PageHeader
        title="Policies"
        subtitle="Edit the Privacy Policy, Terms of Use and Refund Policy shown on the website. Changes go live as soon as you publish, and every change is recorded in the activity log."
      />
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
