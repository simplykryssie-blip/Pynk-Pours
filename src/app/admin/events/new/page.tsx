import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { EventForm } from "@/components/admin/forms/EventForm";
import { PageHeader } from "@/components/admin/ui";
import { createEvent } from "@/server/admin/events";
import { requireStaff } from "@/server/auth/staff";

export const metadata: Metadata = { title: "New event" };

export default async function NewEventPage() {
  const staff = await requireStaff(["owner", "admin"]);
  return (
    <AdminShell staff={staff}>
      <PageHeader title="New event" back={{ href: "/admin/events", label: "All events" }}
        subtitle="New events start as drafts. Nothing appears on the website until you publish." />
      <EventForm action={createEvent} defaults={{ registration_mode: "coming_soon", timezone: "America/Chicago" }} submitLabel="Create draft" />
    </AdminShell>
  );
}
