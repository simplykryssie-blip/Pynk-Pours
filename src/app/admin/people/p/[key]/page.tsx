import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { PersonNotes } from "@/components/admin/forms/PersonNotes";
import { Card, EmptyState, PageHeader, Stat, StatusBadge } from "@/components/admin/ui";
import { formatEventDate, formatEventTime } from "@/lib/datetime";
import { emailFromKey, MARKETING_LABEL } from "@/lib/people";
import { requireStaff } from "@/server/auth/staff";

export const metadata: Metadata = { title: "Person" };

type Item = { at: string; kind: string; event_title: string | null; event_id: string | null; detail: string; ref: string };
type Person = {
  email: string; name: string | null; phone: string | null; first_seen: string; last_seen: string;
  events_registered: number; events_attended: number; events_missed: number; inquiries: number; interest: number;
  marketing: string; tags: string[]; notes: string; timeline: Item[];
};

const KIND: Record<string, string> = {
  order: "Bought tickets", ticket: "Ticket", attended: "Attended", interest: "Interested",
  inquiry: "Sent a message", subscribed: "Subscribed", unsubscribed: "Unsubscribed",
};

function link(i: Item): string | null {
  if (i.kind === "order") return `/admin/registrations/${i.ref}`;
  if (i.kind === "inquiry") return `/admin/inbox?show=all#message-${i.ref}`;
  if ((i.kind === "ticket" || i.kind === "attended" || i.kind === "interest") && i.event_id) return `/admin/events/${i.event_id}/registrations`;
  return null;
}

export default async function PersonPage({ params }: PageProps<"/admin/people/p/[key]">) {
  const staff = await requireStaff(["owner", "admin"]);
  const email = emailFromKey((await params).key);
  if (!email) notFound();
  const { data } = await staff.db.rpc("admin_person", { p_email: email });
  const p = data as Person | null;
  if (!p) notFound();
  return (
    <AdminShell staff={staff}>
      <PageHeader title={p.name ?? p.email} back={{ href: "/admin/people", label: "People" }}
        subtitle={<span className="flex flex-wrap items-center gap-2">
          <a className="text-pp-pink-strong underline" href={`mailto:${p.email}`}>{p.email}</a>
          {p.phone && <a className="underline" href={`tel:${p.phone}`}>{p.phone}</a>}
          <StatusBadge status={p.marketing === "yes" ? "active" : p.marketing === "unsubscribed" ? "failed" : "inactive"} label={MARKETING_LABEL[p.marketing]} />
        </span>} />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Events attended" value={p.events_attended} hint={`of ${p.events_registered} registered`} />
        <Stat label="Missed" value={p.events_missed} hint="past events, no check-in" />
        <Stat label="Messages" value={p.inquiries} />
        <Stat label="First seen" value={formatEventDate(p.first_seen, "America/Chicago")} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card title="History" region>
          {p.timeline.length === 0 ? <EmptyState title="No activity" /> : (
            <ol className="space-y-3">
              {p.timeline.map((i, n) => {
                const href = link(i);
                const body = <>
                  <p className="text-xs text-pp-black/60">{formatEventDate(i.at, "America/Chicago")} · {formatEventTime(i.at, "America/Chicago")}</p>
                  <p className="font-semibold">{KIND[i.kind] ?? i.kind}{i.event_title ? `: ${i.event_title}` : ""}</p>
                  <p className="text-sm text-pp-black/75">{i.detail}</p>
                </>;
                return (
                  <li key={n} className="rounded-sm border border-pp-black/10 p-3">
                    {href ? <Link href={href} className="block hover:text-pp-pink-strong">{body}</Link> : body}
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
        <Card title="Notes and tags" region>
          <PersonNotes email={p.email} notes={p.notes} tags={p.tags} />
        </Card>
      </div>
    </AdminShell>
  );
}
