import Link from "next/link";
import { cx } from "@/components/ui/primitives";
import { eventOperation } from "@/server/admin/events";
import type { AdminEvent } from "@/server/admin/queries";
import { eventWhen } from "@/components/events/format";
import { isEventOperation, OP_DONE } from "./event-ops";
import { OpButton } from "./forms/OpButton";
import { Notice, smallButton, StatusBadge } from "./ui";

const TABS = [
  { slug: "", label: "Details" },
  { slug: "tickets", label: "Tickets" },
  { slug: "media", label: "Images" },
  { slug: "registrations", label: "Registrations" },
];

export function EventHeader({ event, active, done }: { event: AdminEvent; active: string; done?: string | string[] }) {
  const when = eventWhen(event);
  const archived = Boolean(event.archived_at);
  const base = `/admin/events/${event.id}`;
  const f = { id: event.id, return_to: active ? `${base}/${active}` : base };
  return (
    <div className="mb-6 space-y-4">
      <Link href="/admin/events" className="text-sm text-pp-black/70 hover:text-pp-pink-strong">← All events</Link>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={archived ? "archived" : event.status} />
            {event.is_featured && <StatusBadge status="completed" label="Featured" />}
          </div>
          <h1 className="mt-2 font-serif text-3xl leading-tight sm:text-4xl">{event.title}</h1>
          <p className="mt-1 text-sm text-pp-black/70">{when.date}{when.time ? ` · ${when.time}` : ""}</p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {event.status === "published" && !archived
            ? <a href={`/events/${event.slug}`} target="_blank" rel="noopener" className={smallButton("secondary")}>View live ↗</a>
            : <Link href={`${base}/preview`} className={smallButton("secondary")}>Preview</Link>}
          {!archived && event.status === "draft" && <OpButton action={eventOperation} fields={{ ...f, op: "publish" }} label="Publish" variant="primary" pendingLabel="Publishing…" />}
          {!archived && event.status === "published" && (
            <OpButton action={eventOperation} fields={{ ...f, op: "unpublish" }} label="Unpublish" confirm="Hide this event from the website?" />
          )}
          <OpButton action={eventOperation} fields={{ ...f, op: "duplicate" }} label="Duplicate" pendingLabel="Duplicating…" showResult={false} />
          {!archived && event.status === "published" && (
            <OpButton action={eventOperation} fields={{ ...f, op: "complete" }} label="Mark completed" confirm="Mark this event as completed? It will move to Past events." />
          )}
          {!archived && event.status !== "cancelled" && event.status !== "completed" && event.published_at && (
            <OpButton action={eventOperation} fields={{ ...f, op: "cancel" }} label="Cancel event" variant="danger"
              confirm="Cancel this event? It will show as cancelled on the website. Refunds are handled separately." />
          )}
          {archived
            ? <OpButton action={eventOperation} fields={{ ...f, op: "unarchive" }} label="Restore from archive" />
            : <OpButton action={eventOperation} fields={{ ...f, op: "archive" }} label="Archive" variant="danger"
                confirm="Archive this event? It will be removed from the website and active lists. Nothing is deleted and you can restore it later." />}
        </div>
      </div>
      {isEventOperation(done) && <Notice tone="success">{OP_DONE[done]}</Notice>}
      <nav aria-label="Event sections" className="-mx-4 overflow-x-auto border-b border-pp-black/10 px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-1">
          {TABS.map((t) => {
            const isActive = active === t.slug;
            return (
              <li key={t.slug}>
                <Link href={t.slug ? `${base}/${t.slug}` : base} aria-current={isActive ? "page" : undefined}
                  className={cx("block border-b-2 px-3 py-2.5 text-sm font-semibold whitespace-nowrap",
                    isActive ? "border-pp-pink-strong text-pp-pink-strong" : "border-transparent text-pp-black/70 hover:text-pp-black")}>
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
