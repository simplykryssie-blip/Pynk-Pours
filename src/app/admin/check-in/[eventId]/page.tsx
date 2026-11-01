import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { CheckInButton } from "@/components/admin/forms/CheckInButton";
import { Card, EmptyState, PageHeader, smallButton, Stat, StatusBadge } from "@/components/admin/ui";
import { formatEventTime } from "@/lib/datetime";
import { requireStaff } from "@/server/auth/staff";

export const metadata: Metadata = { title: "Check-in" };

const RESULT_LABEL: Record<string, string> = {
  accepted: "Accepted", already_checked_in: "Already checked in", invalid: "Invalid", wrong_event: "Wrong event", refunded: "Refunded", cancelled: "Cancelled",
};

export default async function CheckInEvent({ params, searchParams }: PageProps<"/admin/check-in/[eventId]">) {
  const staff = await requireStaff();
  const [{ eventId }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(eventId)) notFound();
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const { data: ev } = await staff.db.rpc("admin_events_overview");
  const event = ((ev ?? []) as { id: string; title: string; timezone: string | null }[]).find((e) => e.id === eventId);
  if (!event) notFound();
  const tz = event.timezone ?? "America/Chicago";
  const [{ data: att }, { data: recent }, { data: found }] = await Promise.all([
    staff.db.rpc("event_attendance", { p_event_id: eventId }),
    staff.db.rpc("recent_check_ins", { p_event_id: eventId, p_limit: 15 }),
    q.length >= 2 ? staff.db.rpc("lookup_tickets", { p_event_id: eventId, p_query: q, p_limit: 25 }) : Promise.resolve({ data: [] }),
  ]);
  const attendance = att as { valid_tickets: number; checked_in: number; by_type: { ticket_type: string; valid: number; checked_in: number }[] };
  type Found = { ticket_id: string; manual_code: string; attendee_name: string; attendee_email: string; ticket_type: string; status: string; checked_in_at: string | null; order_number: number };
  type Recent = { scanned_at: string; result: string; method: string; attendee_name: string | null; ticket_type: string | null; scanned_by: string | null; voided: boolean };
  return (
    <AdminShell staff={staff}>
      <PageHeader title={event.title} back={{ href: "/admin/check-in", label: "Check-in" }} subtitle="Manual lookup. Camera QR scanning is added with digital tickets (Stage E)." />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Checked in" value={attendance.checked_in} hint={`of ${attendance.valid_tickets} tickets`} />
        <Stat label="Remaining" value={attendance.valid_tickets - attendance.checked_in} />
        {attendance.by_type.slice(0, 2).map((t) => <Stat key={t.ticket_type} label={t.ticket_type} value={`${t.checked_in}/${t.valid}`} />)}
      </div>
      <Card title="Find a guest">
        <form className="flex gap-2" role="search">
          <label htmlFor="ci-q" className="sr-only">Name, email, ticket code or order number</label>
          <input id="ci-q" name="q" defaultValue={q} autoFocus placeholder="Name, email, ticket code or order #" className="w-full rounded-sm border border-pp-black/20 px-3 py-3 text-base" />
          <button type="submit" className={smallButton("primary")}>Search</button>
        </form>
        {q && (
          <ul className="mt-4 space-y-3">
            {((found ?? []) as Found[]).length === 0 && <li><EmptyState title="No matching tickets" /></li>}
            {((found ?? []) as Found[]).map((t) => (
              <li key={t.ticket_id} className="flex flex-col gap-3 rounded-sm border border-pp-black/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-lg font-semibold">{t.attendee_name}</p>
                  <p className="text-sm text-pp-black/70">{t.ticket_type} · {t.manual_code} · order #{t.order_number}</p>
                  <div className="mt-1 flex gap-2">
                    <StatusBadge status={t.status} />
                    {t.checked_in_at && <StatusBadge status="completed" label={`Checked in ${formatEventTime(t.checked_in_at, tz)}`} />}
                  </div>
                </div>
                {t.status === "valid" && <CheckInButton eventId={eventId} ticketId={t.ticket_id} checkedIn={Boolean(t.checked_in_at)} />}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Recent check-ins" className="mt-6">
        {((recent ?? []) as Recent[]).length === 0 ? <EmptyState title="No scans yet" /> : (
          <ul className="divide-y divide-pp-black/10">
            {((recent ?? []) as Recent[]).map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span><strong>{r.attendee_name ?? "Unknown ticket"}</strong>{r.ticket_type && <span className="text-pp-black/60"> · {r.ticket_type}</span>}</span>
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <StatusBadge status={r.result === "accepted" ? "paid" : "failed"} label={RESULT_LABEL[r.result] ?? r.result} />
                  <span className="text-pp-black/60">{formatEventTime(r.scanned_at, tz)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </AdminShell>
  );
}
