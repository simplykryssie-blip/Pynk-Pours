import { nowMs } from "@/server/clock";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { EmptyState, Notice, PageHeader, smallButton, StatusBadge } from "@/components/admin/ui";
import { cx } from "@/components/ui/primitives";
import { eventWhen } from "@/components/events/format";
import { formatMoney } from "@/lib/money";
import { eventsOverview } from "@/server/admin/queries";
import { requireStaff } from "@/server/auth/staff";

export const metadata: Metadata = { title: "Events" };

const VIEWS = [
  { key: "active", label: "Upcoming & drafts" },
  { key: "past", label: "Past" },
  { key: "archived", label: "Archived" },
] as const;

export default async function AdminEvents({ searchParams }: PageProps<"/admin/events">) {
  const staff = await requireStaff(["owner", "admin"]);
  const sp = await searchParams;
  const view = VIEWS.find((v) => v.key === sp.view)?.key ?? "active";
  const rows = await eventsOverview(staff);
  const now = nowMs();
  const isPast = (r: (typeof rows)[number]) => r.status === "completed" || (r.starts_at !== null && new Date(r.ends_at ?? r.starts_at).getTime() < now);
  const list = rows.filter((r) => view === "archived" ? r.archived_at : !r.archived_at && (view === "past" ? isPast(r) : !isPast(r)));

  return (
    <AdminShell staff={staff}>
      <PageHeader title="Events" actions={<Link href="/admin/events/new" className={smallButton("primary")}>+ New event</Link>} />
      {sp.deleted && <div className="mb-4"><Notice tone="success">Draft deleted.</Notice></div>}
      <nav aria-label="Event filters" className="mb-4 flex gap-2 overflow-x-auto">
        {VIEWS.map((v) => (
          <Link key={v.key} href={v.key === "active" ? "/admin/events" : `/admin/events?view=${v.key}`} aria-current={view === v.key ? "page" : undefined}
            className={cx("rounded-full border px-4 py-2 text-sm font-semibold whitespace-nowrap", view === v.key ? "border-pp-black bg-pp-black text-pp-cream" : "border-pp-black/20 bg-white")}>
            {v.label}
          </Link>
        ))}
      </nav>
      {list.length === 0 ? (
        <EmptyState title="No events here yet">{view === "active" && <Link href="/admin/events/new" className="text-pp-pink-strong underline">Create an event</Link>}</EmptyState>
      ) : (
        <ul className="grid gap-3">
          {list.map((r) => {
            const w = eventWhen(r);
            return (
              <li key={r.id}>
                <Link href={`/admin/events/${r.id}`} className="flex flex-col gap-3 rounded-sm border border-pp-black/10 bg-white p-4 shadow-sm hover:border-pp-pink-strong sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={r.archived_at ? "archived" : r.status} />
                      {r.registration_mode === "coming_soon" && <StatusBadge status="pending" label="Coming soon" />}
                    </div>
                    <p className="mt-1 text-lg font-semibold">{r.title}</p>
                    <p className="text-sm text-pp-black/70">{w.date}{w.time ? ` · ${w.time}` : ""}</p>
                  </div>
                  <dl className="grid grid-cols-3 gap-4 text-sm sm:text-right">
                    <div><dt className="text-xs text-pp-black/60">Tickets</dt><dd className="font-semibold">{r.tickets_valid}{r.capacity ? `/${r.capacity}` : ""}</dd></div>
                    <div><dt className="text-xs text-pp-black/60">Checked in</dt><dd className="font-semibold">{r.checked_in}</dd></div>
                    <div><dt className="text-xs text-pp-black/60">Sales</dt><dd className="font-semibold">{formatMoney((r.gross_cents ?? 0) - (r.refunded_cents ?? 0), r.currency)}</dd></div>
                  </dl>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </AdminShell>
  );
}
