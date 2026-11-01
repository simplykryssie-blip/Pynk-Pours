import { nowMs } from "@/server/clock";
import type { Metadata } from "next";
import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { EmptyState, Notice, PageHeader } from "@/components/admin/ui";
import { eventWhen } from "@/components/events/format";
import { eventsOverview } from "@/server/admin/queries";
import { requireStaff } from "@/server/auth/staff";

export const metadata: Metadata = { title: "Check-in" };

export default async function CheckInIndex({ searchParams }: PageProps<"/admin/check-in">) {
  const staff = await requireStaff();
  const sp = await searchParams;
  const rows = (await eventsOverview(staff)).filter((r) => !r.archived_at && r.status !== "draft" && r.status !== "cancelled");
  const now = nowMs();
  const upcoming = rows.filter((r) => r.starts_at && new Date(r.ends_at ?? r.starts_at).getTime() >= now - 12 * 3600_000);
  return (
    <AdminShell staff={staff}>
      <PageHeader title="Check-in" subtitle="Choose an event to check guests in." />
      {sp.error === "forbidden" && <div className="mb-4"><Notice tone="error">Your role gives you access to check-in only.</Notice></div>}
      {upcoming.length === 0 ? <EmptyState title="No events to check in right now" /> : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {upcoming.map((r) => {
            const w = eventWhen(r);
            return (
              <li key={r.id}>
                <Link href={`/admin/check-in/${r.id}`} className="block rounded-sm border border-pp-black/10 bg-white p-5 shadow-sm hover:border-pp-pink-strong">
                  <p className="text-lg font-semibold">{r.title}</p>
                  <p className="text-sm text-pp-black/70">{w.date}{w.time ? ` · ${w.time}` : ""}</p>
                  <p className="mt-3 text-sm"><strong>{r.checked_in}</strong> of <strong>{r.tickets_valid}</strong> checked in</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </AdminShell>
  );
}
