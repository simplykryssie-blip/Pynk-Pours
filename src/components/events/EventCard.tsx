import Link from "next/link";
import { ArrowIcon, CalendarIcon, ClockIcon, PinIcon } from "@/components/ui/icons";
import { Badge } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/money";
import type { Registration } from "@/lib/registration";
import type { PublicEvent } from "@/server/data/events";
import { EventCover } from "./EventCover";
import { eventWhen, eventWhere } from "./format";

const ctaLabel: Record<Registration["state"], string> = {
  on_sale: "Get tickets",
  not_yet_on_sale: "View details",
  coming_soon: "Get notified",
  sold_out: "View details",
  waitlist: "Join waitlist",
  closed: "View details",
  cancelled: "View details",
  past: "View details",
};

export function EventCard({ event, registration }: { event: PublicEvent; registration: Registration }) {
  const when = eventWhen(event);
  return (
    <article className="group flex flex-col overflow-hidden border border-pp-black/10 bg-white shadow-sm transition-shadow hover:shadow-md">
      <EventCover event={event} className="aspect-[16/10]" />
      <div className="flex flex-1 flex-col gap-3 p-5 sm:p-6">
        <div className="flex flex-wrap gap-2">
          {event.category_label && <Badge>{event.category_label}</Badge>}
          {registration.state !== "on_sale" && <Badge tone="dark">{registration.label}</Badge>}
        </div>
        <h3 className="font-serif text-2xl leading-tight text-pp-black">
          <Link href={`/events/${event.slug}`} className="after:absolute after:inset-0 focus:outline-none">
            <span className="relative">{event.title}</span>
          </Link>
        </h3>
        <ul className="space-y-1.5 text-sm text-pp-black/80">
          <li className="flex items-center gap-2"><CalendarIcon className="text-pp-pink-strong" />{when.date}</li>
          {when.time && <li className="flex items-center gap-2"><ClockIcon className="text-pp-pink-strong" />{when.time}</li>}
          <li className="flex items-center gap-2"><PinIcon className="text-pp-pink-strong" />{eventWhere(event)}</li>
        </ul>
        {event.short_description && <p className="line-clamp-3 text-sm text-pp-black/75">{event.short_description}</p>}
        <div className="mt-auto flex items-center justify-between pt-2">
          {registration.fromPriceCents !== null ? (
            <p className="text-sm font-semibold text-pp-black">From {formatMoney(registration.fromPriceCents, event.currency)}</p>
          ) : <span />}
          <Link
            href={`/events/${event.slug}${registration.state === "on_sale" ? "#tickets" : registration.state === "coming_soon" || registration.state === "waitlist" ? "#register" : ""}`}
            className="relative z-10 inline-flex items-center gap-2 text-xs font-bold tracking-[0.15em] text-pp-pink-strong uppercase hover:underline"
            aria-label={`${ctaLabel[registration.state]}: ${event.title}`}
          >
            {ctaLabel[registration.state]} <ArrowIcon width={16} height={16} />
          </Link>
        </div>
      </div>
    </article>
  );
}
