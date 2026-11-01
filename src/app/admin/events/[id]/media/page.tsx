/* eslint-disable @next/next/no-img-element -- admin thumbnails from our own storage bucket */
import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { EventHeader } from "@/components/admin/EventHeader";
import { MediaUpload } from "@/components/admin/forms/MediaUpload";
import { OpButton } from "@/components/admin/forms/OpButton";
import { MediaAltForm } from "@/components/admin/forms/SmallForms";
import { Card, EmptyState, StatusBadge } from "@/components/admin/ui";
import { mediaOperation } from "@/server/admin/media";
import { adminEvent, eventMedia } from "@/server/admin/queries";
import { eventImageUrl } from "@/server/data/events";
import { requireStaff } from "@/server/auth/staff";

export const metadata: Metadata = { title: "Images" };

export default async function MediaPage({ params, searchParams }: PageProps<"/admin/events/[id]/media">) {
  const staff = await requireStaff(["owner", "admin"]);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const event = await adminEvent(staff, id);
  const media = await eventMedia(staff, id);
  return (
    <AdminShell staff={staff}>
      <EventHeader event={event} active="media" done={sp.done} />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
        <MediaUpload eventId={id} hasCover={Boolean(event.cover_image_path)} />
        <Card title="Event images">
          <p className="mb-4 text-sm text-pp-black/70">The <strong>cover</strong> appears on event cards and at the top of the event page. Images marked <strong>gallery</strong> appear in the event&apos;s public gallery. Use the link to share promotional images.</p>
          {media.length === 0 ? <EmptyState title="No images yet">Upload a cover image or promotional photos.</EmptyState> : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {media.map((m) => {
                const url = eventImageUrl(m.storage_path)!;
                const isCover = event.cover_image_path === m.storage_path;
                const f = { event_id: id, id: m.id };
                return (
                  <li key={m.id} className="space-y-3 rounded-sm border border-pp-black/10 p-3">
                    <img src={url} alt={m.alt_text ?? ""} className="aspect-video w-full rounded-sm bg-pp-black/5 object-cover" loading="lazy" />
                    <div className="flex flex-wrap gap-2">
                      {isCover && <StatusBadge status="published" label="Cover" />}
                      {m.show_in_gallery && <StatusBadge status="completed" label="In gallery" />}
                      <span className="text-xs text-pp-black/60">{m.width}×{m.height}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!isCover && <OpButton action={mediaOperation} fields={{ ...f, op: "cover" }} label="Make cover" />}
                      <OpButton action={mediaOperation} fields={{ ...f, op: "gallery" }} label={m.show_in_gallery ? "Remove from gallery" : "Add to gallery"} />
                      <OpButton action={mediaOperation} fields={{ ...f, op: "delete" }} label="Delete" variant="danger" confirm="Delete this image permanently?" />
                    </div>
                    <a href={url} target="_blank" rel="noopener" className="block truncate text-xs text-pp-pink-strong underline">Open / share image link</a>
                    <MediaAltForm eventId={id} mediaId={m.id} alt={m.alt_text} />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}
