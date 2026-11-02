import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { NewFormForm } from "@/components/admin/forms/FormSmall";
import { Card, PageHeader } from "@/components/admin/ui";
import { requireStaff } from "@/server/auth/staff";

export const metadata: Metadata = { title: "New form" };

export default async function NewForm({ searchParams }: PageProps<"/admin/forms/new">) {
  const staff = await requireStaff(["owner", "admin"]);
  const sp = await searchParams;
  return (
    <AdminShell staff={staff}>
      <PageHeader title="New form" back={{ href: "/admin/forms", label: "Forms" }} subtitle="New forms start as a draft. Nothing is public until you set the status to Open." />
      <Card><NewFormForm defaultTemplate={sp.template === "blank" ? "blank" : "vendor"} /></Card>
    </AdminShell>
  );
}
