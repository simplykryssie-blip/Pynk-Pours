import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { CustomPageEditor } from "@/components/admin/forms/CustomPageEditor";
import { Card, PageHeader } from "@/components/admin/ui";
import { publicSiteUrl } from "@/lib/site-url";
import { requireStaff } from "@/server/auth/staff";

export const metadata: Metadata = { title: "New page" };

export default async function NewCustomPage() {
  const staff = await requireStaff(["owner", "admin"]);
  return (
    <AdminShell staff={staff}>
      <PageHeader title="New page" back={{ href: "/admin/policies", label: "Policies" }}
        subtitle="Add a page such as a Code of Conduct, Photo Policy or Vendor Guidelines. It stays hidden until you tick Published." />
      <Card>
        <CustomPageEditor siteUrl={publicSiteUrl("")}
          page={{ title: "", slug: "", body: "", published: false, show_in_footer: true, footer_position: 100 }} />
      </Card>
    </AdminShell>
  );
}
