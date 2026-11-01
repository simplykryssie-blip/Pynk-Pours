import { formatEventDate, formatEventTimeRange } from "@/lib/datetime";
import type { PublicEvent } from "@/server/data/events";

/** Human date/time strings for an event, in the EVENT's timezone. TBA-safe. */
export function eventWhen(e: Pick<PublicEvent, "starts_at" | "ends_at" | "timezone">) {
  if (!e.starts_at || !e.timezone) return { date: "Date to be announced", time: null as string | null };
  return { date: formatEventDate(e.starts_at, e.timezone), time: formatEventTimeRange(e.starts_at, e.ends_at, e.timezone) };
}

export function eventWhere(e: Pick<PublicEvent, "is_online" | "venue_name">) {
  if (e.is_online) return "Online experience";
  return e.venue_name ?? "Venue to be announced";
}
