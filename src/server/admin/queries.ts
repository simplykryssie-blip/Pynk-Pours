import "server-only";
import { notFound } from "next/navigation";
import type { Staff } from "../auth/staff";
import type { PublicEvent } from "../data/events";

export interface AdminEvent extends PublicEvent {
  capacity: number | null;
  admissions_sold: number;
  archived_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OverviewRow {
  id: string; slug: string; title: string; status: string; registration_mode: string;
  starts_at: string | null; ends_at: string | null; timezone: string | null; archived_at: string | null;
  is_featured: boolean; capacity: number | null; tickets_valid: number; checked_in: number;
  orders_paid: number | null; gross_cents: number | null; refunded_cents: number | null; currency: string;
}

function check<T>(res: { data: T | null; error: { message: string } | null }, context: string): T {
  if (res.error) {
    console.error(`[admin] ${context}: ${res.error.message}`);
    throw new Error(`Couldn't load ${context}.`);
  }
  return res.data as T;
}

export async function eventsOverview(staff: Staff): Promise<OverviewRow[]> {
  const rows = check(await staff.db.rpc("admin_events_overview"), "events overview") as OverviewRow[];
  return rows.map((r) => ({
    ...r,
    gross_cents: r.gross_cents === null ? null : Number(r.gross_cents),
    refunded_cents: r.refunded_cents === null ? null : Number(r.refunded_cents),
  }));
}

export async function adminEvent(staff: Staff, id: string): Promise<AdminEvent> {
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const res = await staff.db.from("events").select("*").eq("id", id).maybeSingle<AdminEvent>();
  const event = check(res, "event");
  if (!event) notFound();
  return event;
}

export interface TierRow {
  id: string; name: string; description: string | null; inclusions: string[]; price_cents: number;
  admits_per_unit: number; capacity: number | null; max_per_order: number | null;
  sales_start_at: string | null; sales_end_at: string | null; sort_order: number; status: string;
  units_sold: number; units_held: number; units_remaining: number | null; has_orders: boolean;
}

export async function eventTiers(staff: Staff, eventId: string): Promise<TierRow[]> {
  const tiers = check(
    await staff.db.from("ticket_types").select("*").eq("event_id", eventId).order("sort_order").order("created_at"),
    "ticket types",
  ) as Omit<TierRow, "units_sold" | "units_held" | "units_remaining" | "has_orders">[];
  const stats = check(await staff.db.rpc("admin_ticket_type_stats", { p_event_id: eventId }), "ticket stats") as
    { ticket_type_id: string; units_sold: number; units_held: number; units_remaining: number | null; has_orders: boolean }[];
  const byId = new Map(stats.map((s) => [s.ticket_type_id, s]));
  return tiers.map((t) => {
    const s = byId.get(t.id);
    return { ...t, units_sold: s?.units_sold ?? 0, units_held: s?.units_held ?? 0, units_remaining: s?.units_remaining ?? null, has_orders: s?.has_orders ?? false };
  });
}

export interface MediaRow {
  id: string; storage_path: string; alt_text: string | null; width: number | null; height: number | null;
  bytes: number | null; show_in_gallery: boolean; sort_order: number; created_at: string;
}

export async function eventMedia(staff: Staff, eventId: string): Promise<MediaRow[]> {
  return check(await staff.db.from("event_media").select("*").eq("event_id", eventId).order("sort_order"), "media") as MediaRow[];
}

export interface AttendeeRow {
  ticket_id: string | null; manual_code: string | null; ticket_status: string | null; checked_in_at: string | null;
  attendee_id: string; full_name: string; email: string; phone: string | null; ticket_type: string;
  order_id: string; order_number: number; order_status: string;
}

export async function eventAttendees(staff: Staff, eventId: string, q?: string): Promise<AttendeeRow[]> {
  const res = await staff.db
    .from("attendees")
    .select("id, full_name, email, phone, position, ticket_types(name), orders!inner(id, order_number, status), tickets(id, manual_code, status, checked_in_at)")
    .eq("event_id", eventId)
    .in("orders.status", ["paid", "partially_refunded", "refunded"])
    .order("created_at", { ascending: false })
    .limit(1000);
  type Raw = { id: string; full_name: string; email: string; phone: string | null; ticket_types: { name: string } | null;
    orders: { id: string; order_number: number; status: string }; tickets: { id: string; manual_code: string; status: string; checked_in_at: string | null } | { id: string; manual_code: string; status: string; checked_in_at: string | null }[] | null };
  const rows = (check(res, "attendees") as unknown as Raw[]).map((r) => {
    const t = Array.isArray(r.tickets) ? r.tickets[0] : r.tickets;
    return {
      ticket_id: t?.id ?? null, manual_code: t?.manual_code ?? null, ticket_status: t?.status ?? null, checked_in_at: t?.checked_in_at ?? null,
      attendee_id: r.id, full_name: r.full_name, email: r.email, phone: r.phone, ticket_type: r.ticket_types?.name ?? "",
      order_id: r.orders.id, order_number: r.orders.order_number, order_status: r.orders.status,
    };
  });
  const term = q?.trim().toLowerCase();
  if (!term) return rows;
  return rows.filter((r) =>
    r.full_name.toLowerCase().includes(term) || r.email.includes(term) ||
    r.manual_code?.toLowerCase() === term.replace(/-/g, "") || String(r.order_number) === term);
}

export async function eventInterest(staff: Staff, eventId: string) {
  return check(
    await staff.db.from("event_interest").select("id, kind, name, email, quantity, status, created_at").eq("event_id", eventId).order("created_at", { ascending: false }).limit(1000),
    "interest list",
  ) as { id: string; kind: string; name: string | null; email: string; quantity: number | null; status: string; created_at: string }[];
}
