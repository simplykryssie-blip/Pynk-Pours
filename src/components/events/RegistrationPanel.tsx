import { InterestForm } from "@/components/forms/InterestForm";
import { LinkButton } from "@/components/ui/primitives";
import { formatEventDate } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import type { Registration } from "@/lib/registration";
import type { PublicEvent } from "@/server/data/events";

/**
 * The event page's call to action, driven by deriveRegistration().
 * Online checkout is enabled in Stage D; until then on-sale events collect
 * "notify me when registration opens" sign-ups instead of taking payment.
 */
export function RegistrationPanel({ event, registration }: { event: PublicEvent; registration: Registration }) {
  const heading = "text-sm font-semibold tracking-[0.2em] text-pp-gold uppercase";
  switch (registration.state) {
    case "coming_soon":
      return (
        <div className="space-y-4">
          <p className={heading}>Coming soon</p>
          <p className="text-pp-cream/85">Details are on the way. Leave your email and we&apos;ll let you know as soon as they&apos;re announced.</p>
          <InterestForm eventSlug={event.slug} kind="notify" cta="Get notified" />
        </div>
      );
    case "on_sale":
      return (
        <div className="space-y-4">
          <p className={heading}>Tickets</p>
          {registration.fromPriceCents !== null && (
            <p className="font-serif text-3xl text-pp-cream">From {formatMoney(registration.fromPriceCents, event.currency)}</p>
          )}
          <p className="text-pp-cream/85">Online registration is opening soon. Leave your email and we&apos;ll send you the link as soon as it&apos;s live.</p>
          <InterestForm eventSlug={event.slug} kind="notify" cta="Notify me when registration opens" />
          <LinkButton href="#tickets" variant="secondary" className="w-full">View ticket options</LinkButton>
        </div>
      );
    case "not_yet_on_sale":
      return (
        <div className="space-y-4">
          <p className={heading}>Tickets coming soon</p>
          {registration.salesOpenAt && event.timezone && (
            <p className="text-pp-cream/85">Sales open {formatEventDate(registration.salesOpenAt, event.timezone)}.</p>
          )}
          <InterestForm eventSlug={event.slug} kind="notify" cta="Remind me when sales open" />
        </div>
      );
    case "waitlist":
      return (
        <div className="space-y-4">
          <p className={heading}>Sold out</p>
          <p className="text-pp-cream/85">This experience is full. Join the waitlist and we&apos;ll contact you if a spot opens up.</p>
          <InterestForm eventSlug={event.slug} kind="waitlist" cta="Join the waitlist" />
        </div>
      );
    case "sold_out":
      return <Status title="Sold out" body="This experience is fully booked. Explore other upcoming experiences." />;
    case "cancelled":
      return <Status title="Cancelled" body="This event has been cancelled. Ticket holders will be contacted directly." />;
    case "past":
      return <Status title="This event has ended" body="Thank you to everyone who joined us. See what's coming up next." />;
    default:
      return <Status title="Registration closed" body="Registration for this event is closed." />;
  }
}

function Status({ title, body }: { title: string; body: string }) {
  return (
    <div className="space-y-4">
      <p className="font-serif text-2xl text-pp-cream">{title}</p>
      <p className="text-pp-cream/85">{body}</p>
      <LinkButton href="/events" variant="secondary" className="w-full">Explore upcoming events</LinkButton>
    </div>
  );
}
