import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { ReplyForm } from "@/components/admin/forms/ReplyForm";
import { Card, EmptyState, Notice, PageHeader, smallButton, StatusBadge } from "@/components/admin/ui";
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
  const ids = (messages ?? []).map((m) => m.id as string);
  const { data: replyRows } = ids.length
    ? await staff.db.from("contact_replies").select("submission_id, body, created_at").in("submission_id", ids).order("created_at")
    : { data: [] };
  const replies = new Map<string, { body: string; created_at: string }[]>();
  for (const r of (replyRows ?? []) as { submission_id: string; body: string; created_at: string }[]) {
    replies.set(r.submission_id, [...(replies.get(r.submission_id) ?? []), r]);
  }
  return (
    <AdminShell staff={staff}>
      <PageHeader title="Inbox" subtitle="Messages from the contact and partnership forms. Tap Reply to answer by email from hello@pynkpours.com."
        actions={<a href="/admin/inbox/newsletter" className={smallButton("secondary")}>Download newsletter list ({subscribers ?? 0})</a>} />
      {(() => {
        const replied = (messages ?? []).find((m) => m.id === sp.replied);
        return replied ? <div className="mb-4"><Notice tone="success">Reply sent to {replied.email}. The message is marked handled.</Notice></div> : null;
      })()}
      <div className="mb-4 flex gap-2">
        <a href="/admin/inbox" aria-current={show === "new" ? "page" : undefined} className={smallButton(show === "new" ? "primary" : "secondary")}>New</a>
        <a href="/admin/inbox?show=all" aria-current={show === "all" ? "page" : undefined} className={smallButton(show === "all" ? "primary" : "secondary")}>All</a>
      </div>
      {(messages ?? []).length === 0 ? <EmptyState title="No messages" /> : (
        <ul className="space-y-4">
          {(messages ?? []).map((m) => (
            <li key={m.id} id={`message-${m.id}`} className="scroll-mt-24">
              <Card>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={m.status === "new" ? "pending" : m.status === "spam" ? "failed" : "paid"} label={m.status} />
                  <StatusBadge status="completed" label={m.topic} />
                  <span className="text-xs text-pp-black/60">{formatEventDate(m.created_at, "America/Chicago")}</span>
                </div>
                <p className="mt-2 font-semibold">{m.name} · <a className="text-pp-pink-strong underline" href={`mailto:${m.email}`}>{m.email}</a></p>
                {m.subject && <p className="text-sm font-medium">{m.subject}</p>}
                <p className="mt-2 text-sm whitespace-pre-wrap text-pp-black/80">{m.message}</p>
                {(replies.get(m.id) ?? []).map((r, i) => (
                  <div key={i} className="mt-3 rounded-sm border-l-4 border-pp-pink-strong/40 bg-pp-black/[0.03] p-3 text-sm" data-testid="sent-reply">
                    <p className="text-xs font-semibold text-pp-black/60">You replied · {formatEventDate(r.created_at, "America/Chicago")}</p>
                    <p className="mt-1 whitespace-pre-wrap text-pp-black/80">{r.body}</p>
                  </div>
                ))}
                <div className="mt-3"><ReplyForm id={m.id} name={m.name} email={m.email} /></div>
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
