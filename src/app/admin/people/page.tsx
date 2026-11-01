import type { Metadata } from "next";
import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card, EmptyState, PageHeader, smallButton, StatusBadge, TableWrap } from "@/components/admin/ui";
import { formatEventDate } from "@/lib/datetime";
import { MARKETING_LABEL, parseSegment, PEOPLE_SEGMENTS, personKey } from "@/lib/people";
import { requireStaff } from "@/server/auth/staff";

export const metadata: Metadata = { title: "People" };

const PAGE = 50;
type Row = {
  email: string; name: string | null; phone: string | null; last_seen: string;
  events_registered: number; events_attended: number; events_missed: number; inquiries: number; interest: number;
  marketing: string; tags: string[]; total_count: number;
};

export default async function PeoplePage({ searchParams }: PageProps<"/admin/people">) {
  const staff = await requireStaff(["owner", "admin"]);
  const sp = await searchParams;
  const segment = parseSegment(sp.segment);
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const tag = typeof sp.tag === "string" ? sp.tag.trim().toLowerCase().slice(0, 30) : "";
  const page = Math.max(1, Math.min(1000, Number(sp.page) || 1));
  const { data, error } = await staff.db.rpc("admin_people", {
    p_search: q || null, p_segment: segment, p_tag: tag || null, p_limit: PAGE, p_offset: (page - 1) * PAGE,
  });
  const rows = (data ?? []) as Row[];
  const total = Number(rows[0]?.total_count ?? 0);
  const params = (over: Record<string, string | number | null>) => {
    const u = new URLSearchParams();
    const v = { segment, q, tag, page: 1, ...over };
    for (const [k, val] of Object.entries(v)) if (val && !(k === "segment" && val === "all") && !(k === "page" && val === 1)) u.set(k, String(val));
    const s = u.toString();
    return s ? `?${s}` : "";
  };
  const exportHref = `/admin/people/export${params({ page: null })}`;

  return (
    <AdminShell staff={staff}>
      <PageHeader
        title="People"
        subtitle="Everyone who has bought or registered, attended, joined a waitlist, sent a message or signed up for the newsletter. One row per email, updated automatically."
        actions={<a href={exportHref} className={smallButton("secondary")}>Download CSV</a>}
      />
      <Card className="mb-4">
        <form role="search" className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <div>
            <label htmlFor="pp-q" className="text-sm font-medium">Search</label>
            <input id="pp-q" name="q" defaultValue={q} placeholder="Name or email" className="mt-1 block w-full rounded-sm border border-pp-black/20 px-3 py-2.5 text-base" />
          </div>
          <div>
            <label htmlFor="pp-seg" className="text-sm font-medium">Show</label>
            <select id="pp-seg" name="segment" defaultValue={segment} className="mt-1 block w-full rounded-sm border border-pp-black/20 bg-white px-3 py-2.5 text-base">
              {PEOPLE_SEGMENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          {tag && <input type="hidden" name="tag" value={tag} />}
          <div className="flex items-end"><button type="submit" className={smallButton("primary", "w-full")}>Apply</button></div>
        </form>
        {tag && <p className="mt-3 text-sm">Tag: <strong>{tag}</strong> · <Link className="underline" href={`/admin/people${params({ tag: null })}`}>clear</Link></p>}
        <p className="mt-3 text-xs text-pp-black/65">
          Personal emails (like an Inbox reply) can go to anyone here. Newsletters and other bulk emails only go to people marked
          “Can receive marketing”: they signed up or ticked the box at checkout, and haven&apos;t unsubscribed.
        </p>
      </Card>

      {error ? <EmptyState title="The list couldn't be loaded">Please refresh the page.</EmptyState>
        : rows.length === 0 ? <EmptyState title="No one matches">Try a different search or filter.</EmptyState> : (
        <>
          <p className="mb-2 text-sm text-pp-black/70" role="status">{total} {total === 1 ? "person" : "people"}</p>
          <TableWrap label="People">
              <thead><tr className="border-b border-pp-black/10 text-xs text-pp-black/60 uppercase">
                <th scope="col" className="py-2 pr-3">Person</th>
                <th scope="col" className="py-2 pr-3">Events</th>
                <th scope="col" className="py-2 pr-3">Other</th>
                <th scope="col" className="py-2 pr-3">Marketing</th>
                <th scope="col" className="py-2">Last activity</th>
              </tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.email} className="border-b border-pp-black/5 align-top">
                    <td className="py-3 pr-3">
                      <Link href={`/admin/people/p/${personKey(p.email)}`} className="font-semibold hover:text-pp-pink-strong">{p.name ?? p.email}</Link>
                      {p.name && <div className="text-pp-black/60">{p.email}</div>}
                      {p.tags.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{p.tags.map((t) => (
                        <Link key={t} href={`/admin/people${params({ tag: t })}`} className="rounded-sm bg-pp-black/5 px-1.5 py-0.5 text-xs">#{t}</Link>
                      ))}</div>}
                    </td>
                    <td className="py-3 pr-3 whitespace-nowrap">
                      {p.events_registered > 0 ? <>{p.events_attended} attended / {p.events_registered} registered{p.events_missed > 0 && <div className="text-xs text-pp-black/60">{p.events_missed} missed</div>}</> : <span className="text-pp-black/65">None</span>}
                    </td>
                    <td className="py-3 pr-3 text-xs text-pp-black/70">
                      {p.inquiries > 0 && <div>{p.inquiries} message{p.inquiries > 1 ? "s" : ""}</div>}
                      {p.interest > 0 && <div>{p.interest} waitlist/notify</div>}
                    </td>
                    <td className="py-3 pr-3"><StatusBadge status={p.marketing === "yes" ? "active" : p.marketing === "unsubscribed" ? "failed" : "inactive"} label={MARKETING_LABEL[p.marketing]} /></td>
                    <td className="py-3 whitespace-nowrap text-pp-black/70">{formatEventDate(p.last_seen, "America/Chicago")}</td>
                  </tr>
                ))}
              </tbody>
          </TableWrap>
          {total > PAGE && (
            <nav aria-label="Pages" className="mt-4 flex items-center gap-3 text-sm">
              {page > 1 && <Link className={smallButton("secondary")} href={`/admin/people${params({ page: page - 1 })}`}>← Previous</Link>}
              <span>Page {page} of {Math.ceil(total / PAGE)}</span>
              {page * PAGE < total && <Link className={smallButton("secondary")} href={`/admin/people${params({ page: page + 1 })}`}>Next →</Link>}
            </nav>
          )}
        </>
      )}
    </AdminShell>
  );
}
