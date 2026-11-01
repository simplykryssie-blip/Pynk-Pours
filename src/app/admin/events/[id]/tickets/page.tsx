import type { Metadata } from "next";
import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { EventHeader } from "@/components/admin/EventHeader";
import { OpButton } from "@/components/admin/forms/OpButton";
import { TicketForm } from "@/components/admin/forms/TicketForm";
import { Card, EmptyState, Notice, StatusBadge } from "@/components/admin/ui";
import { formatEventDate, formatEventTime } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { utcToZonedLocal } from "@/lib/zoned-time";
import { ticketOperation } from "@/server/admin/tickets";
import { adminEvent, eventTiers } from "@/server/admin/queries";
import { requireStaff } from "@/server/auth/staff";

export const metadata: Metadata = { title: "Tickets" };

export default async function TicketsPage({ params, searchParams }: PageProps<"/admin/events/[id]/tickets">) {
  const staff = await requireStaff(["owner", "admin"]);
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const event = await adminEvent(staff, id);
  const tiers = await eventTiers(staff, id);
  const tz = event.timezone;
  const fmt = (iso: string | null) => (iso && tz ? `${formatEventDate(iso, tz)} ${formatEventTime(iso, tz)}` : null);
  const local = (iso: string | null) => (iso && tz ? utcToZonedLocal(iso, tz) : "");

  return (
    <AdminShell staff={staff}>
      <EventHeader event={event} active="tickets" done={sp.done} />
      {sp.created && <div className="mb-4"><Notice tone="success">Draft created. Now add your ticket options — one ticket or as many tiers as you like. VIP is optional.</Notice></div>}
      {event.registration_mode !== "tickets" && tiers.length > 0 && (
        <div className="mb-4"><Notice tone="info">Registration is set to “{event.registration_mode === "coming_soon" ? "Coming soon" : "Closed"}”, so these tickets aren&apos;t on sale yet. Change it under <Link className="underline" href={`/admin/events/${id}`}>Details → Registration</Link>.</Notice></div>
      )}
      <div className="mb-4 text-sm text-pp-black/70">
        Registration deadline: <strong>{fmt(event.registration_closes_at) ?? "none (each ticket's own window, or the event end)"}</strong>
        {" · "}Total capacity: <strong>{event.capacity ?? "no overall limit"}</strong>
      </div>

      {tiers.length === 0 ? (
        <EmptyState title="No tickets yet">Add your first ticket below.</EmptyState>
      ) : (
        <ol className="grid gap-4">
          {tiers.map((t, i) => (
            <li key={t.id}>
              <Card>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-pp-black/60">#{i + 1}</span>
                      <StatusBadge status={t.status} />
                      {t.admits_per_unit > 1 && <StatusBadge status="completed" label={`Admits ${t.admits_per_unit}`} />}
                    </div>
                    <h2 className="mt-1 text-lg font-semibold">{t.name}</h2>
                    <p className="text-sm text-pp-black/70">
                      {t.price_cents === 0 ? "Free" : formatMoney(t.price_cents, event.currency)}
                      {t.max_per_order ? ` · max ${t.max_per_order} per order` : ""}
                    </p>
                    <p className="text-sm text-pp-black/70">
                      Sales: {fmt(t.sales_start_at) ? `from ${fmt(t.sales_start_at)}` : "open now"} — {fmt(t.sales_end_at) ? `until ${fmt(t.sales_end_at)}` : "until the deadline / event end"}
                    </p>
                  </div>
                  <dl className="grid grid-cols-3 gap-4 text-center text-sm">
                    <div><dt className="text-xs text-pp-black/60">Sold</dt><dd className="text-lg font-semibold">{t.units_sold}</dd></div>
                    <div><dt className="text-xs text-pp-black/60">In checkout</dt><dd className="text-lg font-semibold">{t.units_held}</dd></div>
                    <div><dt className="text-xs text-pp-black/60">Left</dt><dd className="text-lg font-semibold">{t.units_remaining ?? "∞"}{t.capacity !== null && <span className="text-xs font-normal text-pp-black/60"> / {t.capacity}</span>}</dd></div>
                  </dl>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {i > 0 && <OpButton action={ticketOperation} fields={{ event_id: id, id: t.id, op: "up" }} label="↑ Move up" showResult={false} />}
                  {i < tiers.length - 1 && <OpButton action={ticketOperation} fields={{ event_id: id, id: t.id, op: "down" }} label="↓ Move down" showResult={false} />}
                  {!t.has_orders && <OpButton action={ticketOperation} fields={{ event_id: id, id: t.id, op: "delete" }} label="Delete" variant="danger" confirm={`Delete “${t.name}”?`} />}
                </div>
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-pp-pink-strong">Edit this ticket</summary>
                  <div className="mt-3">
                    <TicketForm eventId={id} legend={`Edit ${t.name}`} submitLabel="Save ticket" defaults={{
                      id: t.id, name: t.name, description: t.description, inclusions: t.inclusions,
                      price: (t.price_cents / 100).toFixed(2), admits_per_unit: t.admits_per_unit, capacity: t.capacity,
                      max_per_order: t.max_per_order, sales_start_local: local(t.sales_start_at), sales_end_local: local(t.sales_end_at), status: t.status,
                    }} />
                    {t.has_orders && <p className="mt-2 text-xs text-pp-black/60">This ticket has orders: price changes apply to new orders only, and “guests per ticket” can&apos;t change.</p>}
                  </div>
                </details>
              </Card>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-6"><TicketForm eventId={id} legend="Add a ticket" submitLabel="Add ticket" /></div>
    </AdminShell>
  );
}
