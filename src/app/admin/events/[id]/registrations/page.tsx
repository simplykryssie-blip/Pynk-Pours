import type { Metadata } from "next";
import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { EventHeader } from "@/components/admin/EventHeader";
import { Card, EmptyState, smallButton, Stat, StatusBadge, TableWrap } from "@/components/admin/ui";
import { formatEventDate, formatEventTime } from "@/lib/datetime";
import { adminEvent, eventAttendees, eventInterest } from "@/server/admin/queries";
import { requireStaff } from "@/server/auth/staff";

export const metadata: Metadata = { title: "Registrations" };

export default async function EventRegistrationsPage({ params, searchParams }: PageProps<"/admin/events/[id]/registrations">) {
  const staff = await requireStaff(["owner", "admin"]);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const event = await adminEvent(staff, id);
  const [attendees, interest] = await Promise.all([eventAttendees(staff, id, q), eventInterest(staff, id)]);
  const tz = event.timezone ?? "America/Chicago";
  const valid = attendees.filter((a) => a.ticket_status === "valid");
  const base = `/admin/events/${id}/export`;
  return (
    <AdminShell staff={staff}>
      <EventHeader event={event} active="registrations" done={sp.done} />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Attendees" value={valid.length} />
        <Stat label="Checked in" value={valid.filter((a) => a.checked_in_at).length} />
        <Stat label="Get-notified" value={interest.filter((i) => i.kind === "notify").length} />
        <Stat label="Waitlist" value={interest.filter((i) => i.kind === "waitlist").length} />
      </div>
      <Card title="Attendees" actions={
        <div className="flex flex-wrap gap-2">
          <a href={`${base}/attendees`} className={smallButton("secondary")}>Export attendees (CSV)</a>
          <a href={`${base}/sales`} className={smallButton("secondary")}>Export sales (CSV)</a>
        </div>}>
        <form className="mb-4 flex gap-2" role="search">
          <label htmlFor="att-q" className="sr-only">Search attendees</label>
          <input id="att-q" name="q" defaultValue={q} placeholder="Name, email, ticket code or order #" className="w-full rounded-sm border border-pp-black/20 px-3 py-2.5 text-base" />
          <button type="submit" className={smallButton("secondary")}>Search</button>
        </form>
        {attendees.length === 0 ? <EmptyState title={q ? "No matches" : "No registrations yet"}>{!q && "Registrations appear here once guests buy tickets."}</EmptyState> : (
          <TableWrap label="Attendees">
            <thead><tr><th>Name</th><th>Ticket</th><th>Status</th><th>Checked in</th><th>Code</th><th>Order</th></tr></thead>
            <tbody>
              {attendees.map((a) => (
                <tr key={a.attendee_id}>
                  <td><p className="font-semibold">{a.full_name}</p><p className="text-xs text-pp-black/60">{a.email}</p></td>
                  <td>{a.ticket_type}</td>
                  <td>{a.ticket_status ? <StatusBadge status={a.ticket_status} /> : "—"}</td>
                  <td className="whitespace-nowrap">{a.checked_in_at ? formatEventTime(a.checked_in_at, tz) : "—"}</td>
                  <td className="font-mono text-xs">{a.manual_code ?? "—"}</td>
                  <td><Link href={`/admin/registrations/${a.order_id}`} className="text-pp-pink-strong underline">#{a.order_number}</Link></td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
      <Card title="Get-notified & waitlist sign-ups" className="mt-6" actions={<a href={`${base}/interest`} className={smallButton("secondary")}>Export (CSV)</a>}>
        {interest.length === 0 ? <EmptyState title="No sign-ups yet" /> : (
          <TableWrap label="Sign-ups">
            <thead><tr><th>Email</th><th>Name</th><th>Type</th><th>Date</th></tr></thead>
            <tbody>{interest.map((i) => (
              <tr key={i.id}><td>{i.email}</td><td>{i.name ?? "—"}</td><td><StatusBadge status={i.kind === "waitlist" ? "pending" : "completed"} label={i.kind === "waitlist" ? "Waitlist" : "Get notified"} /></td><td className="whitespace-nowrap">{formatEventDate(i.created_at, tz)}</td></tr>
            ))}</tbody>
          </TableWrap>
        )}
      </Card>
    </AdminShell>
  );
}
