import type { Metadata } from "next";
import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card, EmptyState, PageHeader, smallButton, StatusBadge, TableWrap } from "@/components/admin/ui";
import { formatEventDate } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { requireStaff } from "@/server/auth/staff";

export const metadata: Metadata = { title: "Registrations" };

export default async function RegistrationsPage({ searchParams }: PageProps<"/admin/registrations">) {
  const staff = await requireStaff(["owner", "admin"]);
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const filter = sp.filter === "review" ? "review" : sp.filter === "all" ? "all" : "paid";
  let query = staff.db
    .from("orders")
    .select("id, order_number, purchaser_name, purchaser_email, status, total_cents, amount_refunded_cents, currency, created_at, paid_at, needs_review, events(title, timezone)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter === "paid") query = query.in("status", ["paid", "partially_refunded", "refunded"]);
  if (filter === "review") query = query.eq("needs_review", true);
  if (q) {
    const safe = q.replace(/[%,()*]/g, " ");
    query = /^\d+$/.test(q) ? query.eq("order_number", Number(q)) : query.or(`purchaser_email.ilike.%${safe}%,purchaser_name.ilike.%${safe}%`);
  }
  const { data, error } = await query;
  type Row = { id: string; order_number: number; purchaser_name: string; purchaser_email: string; status: string; total_cents: number; amount_refunded_cents: number; currency: string; created_at: string; needs_review: boolean; events: { title: string; timezone: string | null } | null };
  const rows = (data ?? []) as unknown as Row[];
  return (
    <AdminShell staff={staff}>
      <PageHeader title="Registrations" subtitle="Orders across all events. Open an order to see its attendees and tickets." />
      <Card>
        <form className="mb-4 flex flex-col gap-2 sm:flex-row" role="search">
          <label htmlFor="ord-q" className="sr-only">Search orders</label>
          <input id="ord-q" name="q" defaultValue={q} placeholder="Purchaser name, email or order #" className="w-full rounded-sm border border-pp-black/20 px-3 py-2.5 text-base" />
          <label htmlFor="ord-f" className="sr-only">Filter</label>
          <select id="ord-f" name="filter" defaultValue={filter} className="rounded-sm border border-pp-black/20 px-3 py-2.5 text-base">
            <option value="paid">Paid & refunded</option><option value="all">All (incl. abandoned)</option><option value="review">Needs review</option>
          </select>
          <button type="submit" className={smallButton("secondary")}>Search</button>
        </form>
        {error ? <EmptyState title="Couldn't load orders" /> : rows.length === 0 ? <EmptyState title="No orders found">Orders appear here once guests register.</EmptyState> : (
          <TableWrap label="Orders">
            <thead><tr><th>Order</th><th>Purchaser</th><th>Event</th><th>Status</th><th>Total</th><th>Date</th></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td><Link href={`/admin/registrations/${o.id}`} className="font-semibold text-pp-pink-strong underline">#{o.order_number}</Link></td>
                  <td><p className="font-medium">{o.purchaser_name}</p><p className="text-xs text-pp-black/60">{o.purchaser_email}</p></td>
                  <td>{o.events?.title}</td>
                  <td><StatusBadge status={o.status} />{o.needs_review && <span className="ml-1"><StatusBadge status="pending" label="Review" /></span>}</td>
                  <td>{formatMoney(o.total_cents - o.amount_refunded_cents, o.currency)}</td>
                  <td className="whitespace-nowrap">{formatEventDate(o.created_at, o.events?.timezone ?? "America/Chicago")}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>
    </AdminShell>
  );
}
