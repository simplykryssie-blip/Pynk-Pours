import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card, EmptyState, PageHeader, smallButton, StatusBadge } from "@/components/admin/ui";
import { formatEventDate } from "@/lib/datetime";
import { markMessage } from "@/server/admin/people";
import { requireStaff } from "@/server/auth/staff";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage({ searchParams }: PageProps<"/admin/inbox">) {
  const staff = await requireStaff(["owner", "admin"]);
  const sp = await searchParams;
  const show = sp.show === "all" ? "all" : "new";
  let q = staff.db.from("contact_submissions").select("*").order("created_at", { ascending: false }).limit(200);
  if (show === "new") q = q.eq("status", "new");
  const [{ data: messages }, { count: subscribers }] = await Promise.all([
    q, staff.db.from("newsletter_subscribers").select("id", { count: "exact", head: true }).is("unsubscribed_at", null),
  ]);
  return (
    <AdminShell staff={staff}>
      <PageHeader title="Inbox" subtitle="Messages from the contact and partnership forms."
        actions={<a href="/admin/inbox/newsletter" className={smallButton("secondary")}>Download newsletter list ({subscribers ?? 0})</a>} />
      <div className="mb-4 flex gap-2">
        <a href="/admin/inbox" aria-current={show === "new" ? "page" : undefined} className={smallButton(show === "new" ? "primary" : "secondary")}>New</a>
        <a href="/admin/inbox?show=all" aria-current={show === "all" ? "page" : undefined} className={smallButton(show === "all" ? "primary" : "secondary")}>All</a>
      </div>
      {(messages ?? []).length === 0 ? <EmptyState title="No messages" /> : (
        <ul className="space-y-4">
          {(messages ?? []).map((m) => (
            <li key={m.id}>
              <Card>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={m.status === "new" ? "pending" : m.status === "spam" ? "failed" : "paid"} label={m.status} />
                  <StatusBadge status="completed" label={m.topic} />
                  <span className="text-xs text-pp-black/60">{formatEventDate(m.created_at, "America/Chicago")}</span>
                </div>
                <p className="mt-2 font-semibold">{m.name} · <a className="text-pp-pink-strong underline" href={`mailto:${m.email}`}>{m.email}</a></p>
                {m.subject && <p className="text-sm font-medium">{m.subject}</p>}
                <p className="mt-2 text-sm whitespace-pre-wrap text-pp-black/80">{m.message}</p>
                <div className="mt-3 flex gap-2">
                  {m.status !== "handled" && <form action={markMessage}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="status" value="handled" /><button className={smallButton("secondary")}>Mark handled</button></form>}
                  {m.status !== "spam" && <form action={markMessage}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="status" value="spam" /><button className={smallButton("danger")}>Spam</button></form>}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
