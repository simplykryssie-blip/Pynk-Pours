import type { Metadata } from "next";
import Link from "next/link";
import { EventView } from "@/components/events/EventView";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { smallButton } from "@/components/admin/ui";
import { deriveRegistration } from "@/lib/registration";
import { adminEvent } from "@/server/admin/queries";
import { getGallery, type TicketOption } from "@/server/data/events";
import { requireStaff } from "@/server/auth/staff";

export const metadata: Metadata = { title: "Preview" };

/** Exactly what visitors will see, rendered from the draft. Staff only; never indexed. */
export default async function PreviewPage({ params }: PageProps<"/admin/events/[id]/preview">) {
  const staff = await requireStaff(["owner", "admin"]);
  const { id } = await params;
  const event = await adminEvent(staff, id);
  const { data } = await staff.db.rpc("get_event_ticket_options", { p_event_id: id });
  const options = (data ?? []) as TicketOption[];
  const gallery = await getGallery(id, staff.db).catch(() => []);
  // Preview as the event will look once published.
  const asPublished = { ...event, status: event.status === "draft" ? ("published" as const) : event.status };
  return (
    <>
      <div role="status" className="sticky top-0 z-[60] flex flex-wrap items-center justify-between gap-3 bg-[#fff4d6] px-4 py-3 text-sm text-[#5c3d00]">
        <p><strong>Preview</strong> — {event.status === "published" && !event.archived_at ? "this event is live." : "not visible to the public until you publish."}</p>
        <Link href={`/admin/events/${id}`} className={smallButton("secondary")}>Back to editing</Link>
      </div>
      <div className="bg-pp-black">
        <SiteHeader />
        <main id="main"><EventView event={asPublished} options={options} gallery={gallery} registration={deriveRegistration(asPublished, options)} preview /></main>
        <SiteFooter />
      </div>
    </>
  );
}
