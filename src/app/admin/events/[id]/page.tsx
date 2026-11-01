import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { EventHeader } from "@/components/admin/EventHeader";
import { EventForm } from "@/components/admin/forms/EventForm";
import { Notice } from "@/components/admin/ui";
import { utcToZonedLocal } from "@/lib/zoned-time";
import { deleteDraftEvent, updateEvent } from "@/server/admin/events";
import { adminEvent } from "@/server/admin/queries";
import { requireStaff } from "@/server/auth/staff";

export const metadata: Metadata = { title: "Edit event" };

const toLocal = (iso: string | null, tz: string | null) => (iso && tz ? utcToZonedLocal(iso, tz) : "");

export default async function EventDetailsPage({ params, searchParams }: PageProps<"/admin/events/[id]">) {
  const staff = await requireStaff(["owner", "admin"]);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const e = await adminEvent(staff, id);
  const tz = e.timezone;
  return (
    <AdminShell staff={staff}>
      <EventHeader event={e} active="" done={sp.done} />
      {sp.duplicated && <div className="mb-4"><Notice tone="success">This is a new draft copy. Update the title, dates and web address, then publish when ready.</Notice></div>}
      {e.archived_at && <div className="mb-4"><Notice tone="warning">This event is archived and hidden from the website.</Notice></div>}
      <EventForm
        action={updateEvent}
        submitLabel="Save changes"
        defaults={{
          ...e,
          starts_local: toLocal(e.starts_at, tz), ends_local: toLocal(e.ends_at, tz),
          registration_closes_local: toLocal(e.registration_closes_at, tz),
          agenda: e.agenda as unknown as Record<string, string>[],
          faqs: e.faqs as unknown as Record<string, string>[],
          speakers: e.speakers as unknown as Record<string, string>[],
        }}
      />
      {e.status === "draft" && !e.published_at && (
        <form action={deleteDraftEvent} className="mt-10 border-t border-pp-black/10 pt-6">
          <input type="hidden" name="id" value={e.id} />
          <p className="text-sm text-pp-black/70">This draft has never been published. You can delete it permanently.</p>
          <button type="submit" className="mt-2 text-sm font-semibold text-[#8c1d18] underline">Delete this draft</button>
        </form>
      )}
    </AdminShell>
  );
}
