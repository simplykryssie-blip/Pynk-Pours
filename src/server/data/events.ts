import "server-only";
import { publicDb } from "../supabase";

/** Public event fields (matches the anon column grant on public.events). */
export const PUBLIC_EVENT_COLUMNS =
  "id, slug, title, short_description, description, category_label, cover_image_path, cover_image_alt, " +
  "starts_at, ends_at, timezone, is_online, venue_name, venue_address, venue_notes, dress_code, " +
  "parking_info, accessibility_info, refund_policy, min_age, agenda, speakers, faqs, currency, " +
  "max_tickets_per_order, show_remaining_count, registration_mode, sold_out_behavior, status, " +
  "is_featured, published_at";

export type RegistrationMode = "tickets" | "coming_soon" | "closed";
export type EventStatus = "draft" | "published" | "cancelled" | "completed";

export interface AgendaItem { time?: string; title: string; description?: string }
export interface Speaker { name: string; title?: string; bio?: string; image_path?: string }
export interface Faq { question: string; answer: string }

export interface PublicEvent {
  id: string;
  slug: string;
  title: string;
  short_description: string | null;
  description: string | null;
  category_label: string | null;
  cover_image_path: string | null;
  cover_image_alt: string | null;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string | null;
  is_online: boolean;
  venue_name: string | null;
  venue_address: string | null;
  venue_notes: string | null;
  dress_code: string | null;
  parking_info: string | null;
  accessibility_info: string | null;
  refund_policy: string | null;
  min_age: number | null;
  agenda: AgendaItem[];
  speakers: Speaker[];
  faqs: Faq[];
  currency: string;
  max_tickets_per_order: number;
  show_remaining_count: boolean;
  registration_mode: RegistrationMode;
  sold_out_behavior: "sold_out" | "waitlist";
  status: EventStatus;
  is_featured: boolean;
  published_at: string | null;
}

export type TicketDisplayState =
  | "on_sale" | "scheduled" | "ended" | "paused" | "closed" | "sold_out" | "coming_soon";

export interface TicketOption {
  id: string;
  name: string;
  description: string | null;
  inclusions: string[];
  price_cents: number;
  currency: string;
  admits_per_unit: number;
  sort_order: number;
  sales_start_at: string | null;
  sales_end_at: string | null;
  display_state: TicketDisplayState;
  remaining: number | null;
  max_purchasable: number;
}

export class DataUnavailableError extends Error {}

function fail(context: string, error: { message: string }): never {
  // Log server-side; never surface database messages to visitors.
  console.error(`[events] ${context}: ${error.message}`);
  throw new DataUnavailableError(context);
}

/** "Upcoming" = not yet ended, or date still to be announced. */
function isUpcoming(e: PublicEvent, now = Date.now()) {
  if (e.status === "completed") return false;
  const end = e.ends_at ?? e.starts_at;
  return end === null || new Date(end).getTime() >= now;
}

function sortUpcoming(a: PublicEvent, b: PublicEvent) {
  // Dated events first (soonest first), then "date TBA" events.
  if (a.starts_at && b.starts_at) return a.starts_at.localeCompare(b.starts_at);
  if (a.starts_at) return -1;
  if (b.starts_at) return 1;
  return a.title.localeCompare(b.title);
}

/** All publicly visible events (RLS: never drafts). */
export async function listPublicEvents(): Promise<PublicEvent[]> {
  const { data, error } = await publicDb()
    .from("events")
    .select(PUBLIC_EVENT_COLUMNS)
    .order("starts_at", { ascending: true, nullsFirst: false })
    .limit(200)
    .returns<PublicEvent[]>();
  if (error) fail("listPublicEvents", error);
  return data ?? [];
}

export async function listUpcomingEvents(): Promise<PublicEvent[]> {
  return (await listPublicEvents())
    .filter((e) => e.status !== "cancelled" && isUpcoming(e))
    .sort(sortUpcoming);
}

export async function listPastEvents(): Promise<PublicEvent[]> {
  return (await listPublicEvents())
    .filter((e) => e.status !== "cancelled" && !isUpcoming(e))
    .sort((a, b) => (b.starts_at ?? "").localeCompare(a.starts_at ?? ""));
}

/** Featured upcoming event: explicitly featured first, else the soonest upcoming. */
export async function getFeaturedEvent(): Promise<PublicEvent | null> {
  const upcoming = await listUpcomingEvents();
  return upcoming.find((e) => e.is_featured) ?? upcoming[0] ?? null;
}

export async function getEventBySlug(slug: string): Promise<PublicEvent | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return null;
  const { data, error } = await publicDb()
    .from("events")
    .select(PUBLIC_EVENT_COLUMNS)
    .eq("slug", slug)
    .maybeSingle<PublicEvent>();
  if (error) fail("getEventBySlug", error);
  return data;
}

export async function getTicketOptions(eventId: string): Promise<TicketOption[]> {
  const { data, error } = await publicDb().rpc("get_event_ticket_options", { p_event_id: eventId });
  if (error) fail("getTicketOptions", error);
  return (data ?? []) as TicketOption[];
}

/** Public URL for an image in the public "event-media" storage bucket. */
export function eventImageUrl(path: string | null): string | null {
  if (!path) return null;
  if (/^https:\/\//.test(path)) return path;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? `${base}/storage/v1/object/public/event-media/${path.replace(/^\/+/, "")}` : null;
}
