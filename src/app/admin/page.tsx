import { nowMs } from "@/server/clock";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card, EmptyState, Notice, PageHeader, smallButton, Stat, StatusBadge, TableWrap } from "@/components/admin/ui";
import { eventWhen } from "@/components/events/format";
import { formatMoney } from "@/lib/money";
import { eventsOverview } from "@/server/admin/queries";
import { requireStaff } from "@/server/auth/staff";

export const metadata: Metadata = { title: "Overview" };

export default async function AdminOverview({ searchParams }: PageProps<"/admin">) {
  const staff = await requireStaff();
  if (!staff.canManage) redirect("/admin/check-in");
  const sp = await searchParams;
  const rows = await eventsOverview(staff);
  const now = nowMs();
  const active = rows.filter((r) => !r.archived_at);
  const upcoming = active.filter((r) => r.status !== "cancelled" && r.status !== "completed" && (!r.starts_at || new Date(r.ends_at ?? r.starts_at).getTime() >= now));
  const sum = (k: "tickets_valid" | "checked_in" | "orders_paid" | "gross_cents" | "refunded_cents") => active.reduce((a, r) => a + (r[k] ?? 0), 0);
  const [{ count: newMessages }, { count: review }] = await Promise.all([
    staff.db.from("contact_submissions").select("id", { count: "exact", head: true }).eq("status", "new"),
    staff.db.from("orders").select("id", { count: "exact", head: true }).eq("needs_review", true),
  ]);

  return (
    <AdminShell staff={staff}>
      <PageHeader title={`Welcome, ${staff.displayName.split(" ")[0]}`} subtitle="Here's how PynkPours is doing."
        actions={<Link href="/admin/events/new" className={smallButton("primary")}>+ New event</Link>} />
      {sp.error === "forbidden" && <div className="mb-4"><Notice tone="error">You don&apos;t have access to that page.</Notice></div>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Upcoming events" value={upcoming.filter((r) => r.status === "published").length} hint={`${upcoming.filter((r) => r.status === "draft").length} draft(s)`} />
        <Stat label="Registrations" value={sum("orders_paid")} hint="Paid orders" />
        <Stat label="Tickets sold" value={sum("tickets_valid")} hint="Valid tickets" />
        <Stat label="Checked in" value={sum("checked_in")} />
        <Stat label="Ticket sales" value={formatMoney(sum("gross_cents") - sum("refunded_cents"))} hint="Net of refunds" />
      </div>
      {((review ?? 0) > 0 || (newMessages ?? 0) > 0) && (
        <div className="mt-4 space-y-2">
          {(review ?? 0) > 0 && <Notice tone="warning">{review} order(s) need review. <Link className="underline" href="/admin/registrations?filter=review">Review now</Link></Notice>}
          {(newMessages ?? 0) > 0 && <Notice tone="info">{newMessages} new message(s) in the <Link className="underline" href="/admin/inbox">inbox</Link>.</Notice>}
        </div>
      )}
      <Card title="Upcoming events" className="mt-6" actions={<Link href="/admin/events" className="text-sm text-pp-pink-strong hover:underline">All events</Link>}>
        {upcoming.length === 0 ? (
          <EmptyState title="No upcoming events">Create your first event to start taking registrations.</EmptyState>
        ) : (
          <TableWrap label="Upcoming events">
            <thead><tr><th>Event</th><th>Date</th><th>Status</th><th>Tickets</th><th>Checked in</th><th>Sales</th></tr></thead>
            <tbody>
              {upcoming.slice(0, 8).map((r) => {
                const w = eventWhen(r);
                return (
                  <tr key={r.id}>
                    <td><Link href={`/admin/events/${r.id}`} className="font-semibold hover:text-pp-pink-strong">{r.title}</Link></td>
                    <td className="whitespace-nowrap">{w.date}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td>{r.tickets_valid}{r.capacity ? ` / ${r.capacity}` : ""}</td>
                    <td>{r.checked_in}</td>
                    <td>{formatMoney((r.gross_cents ?? 0) - (r.refunded_cents ?? 0), r.currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </AdminShell>
  );
}
