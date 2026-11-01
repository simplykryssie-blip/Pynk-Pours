import { DataUnavailableError, getTicketOptions, listUpcomingEvents, type PublicEvent } from "@/server/data/events";
import { deriveRegistration } from "@/lib/registration";
import { EventCard } from "./EventCard";

export async function withRegistration(events: PublicEvent[]) {
  return Promise.all(events.map(async (e) => ({
    event: e,
    registration: deriveRegistration(e, e.registration_mode === "tickets" ? await getTicketOptions(e.id) : []),
  })));
}

export function EventGrid({ items }: { items: Awaited<ReturnType<typeof withRegistration>> }) {
  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(({ event, registration }) => (
        <li key={event.id} className="relative flex"><EventCard event={event} registration={registration} /></li>
      ))}
    </ul>
  );
}

export function EventsUnavailable() {
  return (
    <p role="status" className="border border-pp-black/10 bg-white p-6 text-pp-black/80">
      Our events calendar is temporarily unavailable. Please check back shortly.
    </p>
  );
}

export async function loadSafely<T>(fn: () => Promise<T>): Promise<T | DataUnavailableError> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof DataUnavailableError) return e;
    console.error("[events] unexpected error", e);
    return new DataUnavailableError("unexpected");
  }
}

/** Upcoming events strip for the home page. Renders nothing when there are none. */
export async function UpcomingStrip({ excludeId }: { excludeId?: string }) {
  const res = await loadSafely(async () => withRegistration((await listUpcomingEvents()).filter((e) => e.id !== excludeId).slice(0, 3)));
  if (res instanceof DataUnavailableError || res.length === 0) return null;
  return <EventGrid items={res} />;
}

export function EventGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div aria-hidden className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-96 animate-pulse border border-pp-black/10 bg-white/70" />
      ))}
    </div>
  );
}
