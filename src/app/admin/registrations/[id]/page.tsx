import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { RefundPanel } from "@/components/admin/forms/RefundPanel";
import { AttendeeEditForm } from "@/components/admin/forms/SmallForms";
import { ticketShares } from "@/lib/refunds";
import { Card, Notice, PageHeader, StatusBadge } from "@/components/admin/ui";
import { formatEventDate, formatEventTime } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { requireStaff } from "@/server/auth/staff";

export const metadata: Metadata = { title: "Order" };

export default async function OrderPage({ params }: PageProps<"/admin/registrations/[id]">) {
  const staff = await requireStaff(["owner", "admin"]);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { data: o } = await staff.db
    .from("orders")
    .select("*, events(id, title, timezone), order_items(id, ticket_type_name, unit_price_cents, quantity, admits_per_unit, line_total_cents), attendees(id, order_item_id, position, full_name, email, phone, answers, ticket_types(name), tickets(id, manual_code, status, checked_in_at)), refunds(id, amount_cents, ticket_ids, source, reason, created_at, stripe_refund_id)")
    .eq("id", id)
    .maybeSingle();
  if (!o) notFound();
  const tz = o.events?.timezone ?? "America/Chicago";
  const dt = (iso: string | null) => (iso ? `${formatEventDate(iso, tz)} ${formatEventTime(iso, tz)}` : "—");
  type Att = { id: string; order_item_id: string; position: number; full_name: string; email: string; phone: string | null; ticket_types: { name: string } | null; tickets: { id: string; manual_code: string; status: string; checked_in_at: string | null } | { id: string; manual_code: string; status: string; checked_in_at: string | null }[] | null };
  const attendees = ((o.attendees ?? []) as Att[]).sort((a, b) => a.position - b.position);
  const ticketRows = attendees.flatMap((a) => {
    const t = Array.isArray(a.tickets) ? a.tickets[0] : a.tickets;
    return t ? [{ id: t.id, order_item_id: a.order_item_id, position: a.position, status: t.status, label: `${a.full_name} — ${a.ticket_types?.name ?? ""} (${t.manual_code})` }] : [];
  });
  const shares = ticketShares(o.order_items as { id: string; unit_price_cents: number; admits_per_unit: number }[], ticketRows);
  const refundable = ticketRows.filter((t) => t.status === "valid").map((t) => ({ id: t.id, label: t.label, share_cents: shares.get(t.id) ?? 0 }));
  type RefundRow = { id: string; amount_cents: number; ticket_ids: string[]; source: string; reason: string | null; created_at: string; stripe_refund_id: string | null };
  const refunds = ((o.refunds ?? []) as RefundRow[]).sort((a, b) => a.created_at.localeCompare(b.created_at));
  return (
    <AdminShell staff={staff}>
      <PageHeader title={`Order #${o.order_number}`} back={{ href: "/admin/registrations", label: "All registrations" }}
        subtitle={<><Link className="underline" href={`/admin/events/${o.events?.id}/registrations`}>{o.events?.title}</Link> · placed {dt(o.created_at)}</>} />
      {o.needs_review && <div className="mb-4"><Notice tone="warning">Needs review: {o.review_reason?.replace(/_/g, " ")}. {o.review_reason === "partial_refund_unmapped" ? "A partial refund was made in Stripe — choose which tickets it covers below." : "Payment was received but tickets were not issued. Refund the purchaser from the Stripe dashboard (test mode) or contact them."}</Notice></div>}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card title="Purchase">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-pp-black/60">Status</dt><dd><StatusBadge status={o.status} /></dd>
            <dt className="text-pp-black/60">Purchaser</dt><dd>{o.purchaser_name}<br /><span className="text-pp-black/70">{o.purchaser_email}</span>{o.purchaser_phone && <><br />{o.purchaser_phone}</>}</dd>
            <dt className="text-pp-black/60">Paid</dt><dd>{dt(o.paid_at)}</dd>
            <dt className="text-pp-black/60">Payment</dt><dd className="break-all">{o.payment_provider === "free" ? "Free registration" : o.stripe_payment_intent_id ?? "—"}</dd>
          </dl>
          <table className="mt-4 w-full text-sm">
            <tbody>
              {(o.order_items as { ticket_type_name: string; unit_price_cents: number; quantity: number; line_total_cents: number }[]).map((it, i) => (
                <tr key={i} className="border-t border-pp-black/10"><td className="py-2">{it.quantity} × {it.ticket_type_name}</td><td className="py-2 text-right">{formatMoney(it.line_total_cents, o.currency)}</td></tr>
              ))}
              <tr className="border-t border-pp-black/10 font-semibold"><td className="py-2">Total</td><td className="py-2 text-right">{formatMoney(o.total_cents, o.currency)}</td></tr>
              {o.amount_refunded_cents > 0 && <tr><td className="py-1 text-[#8c1d18]">Refunded</td><td className="py-1 text-right text-[#8c1d18]">−{formatMoney(o.amount_refunded_cents, o.currency)}</td></tr>}
            </tbody>
          </table>
        </Card>
        <div className="space-y-6 lg:col-span-2 lg:row-start-2">
          {["paid", "partially_refunded"].includes(o.status) && (
            <Card title={o.payment_provider === "free" ? "Cancel tickets" : "Refund"}>
              <RefundPanel orderId={o.id} tickets={refundable} currency={o.currency} remainingCents={o.total_cents - o.amount_refunded_cents} free={o.payment_provider === "free" || o.total_cents === 0} />
            </Card>
          )}
          {refunds.length > 0 && (
            <Card title="Refund history">
              <ul className="space-y-2 text-sm">
                {refunds.map((r) => (
                  <li key={r.id} className="flex flex-wrap justify-between gap-2 border-b border-pp-black/10 pb-2">
                    <span>{dt(r.created_at)} · {r.ticket_ids.length} ticket(s) · {r.source === "admin" ? "PynkPours admin" : "Stripe dashboard"}{r.reason ? ` · ${r.reason}` : ""}</span>
                    <span className="font-semibold">−{formatMoney(r.amount_cents, o.currency)} <span className="font-mono text-xs font-normal text-pp-black/60">{r.stripe_refund_id}</span></span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <Card title={`Attendees (${attendees.length})`}>
          <ul className="space-y-4">
            {attendees.map((a) => {
              const t = Array.isArray(a.tickets) ? a.tickets[0] : a.tickets;
              return (
                <li key={a.id} className="rounded-sm border border-pp-black/10 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{a.full_name}</p>
                    <span className="text-sm text-pp-black/60">{a.ticket_types?.name}</span>
                    {t && <StatusBadge status={t.status} />}
                    {t?.checked_in_at && <StatusBadge status="completed" label={`Checked in ${formatEventTime(t.checked_in_at, tz)}`} />}
                  </div>
                  <p className="text-sm text-pp-black/70">{a.email}{a.phone ? ` · ${a.phone}` : ""}{t ? ` · code ${t.manual_code}` : " · no ticket issued"}</p>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-semibold text-pp-pink-strong">Edit attendee</summary>
                    <div className="mt-3"><AttendeeEditForm attendee={a} /></div>
                  </details>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </AdminShell>
  );
}
