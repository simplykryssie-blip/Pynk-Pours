import { TicketSelector } from "@/components/checkout/TicketSelector";
import { InterestForm } from "@/components/forms/InterestForm";
import { LinkButton } from "@/components/ui/primitives";
import { formatEventDate } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import type { Registration } from "@/lib/registration";
import type { PublicEvent, TicketOption } from "@/server/data/events";

/**
 * The event page's call to action, driven by deriveRegistration().
 * Free tickets can always be registered for. Paid tickets are sold only when
 * online payments are switched on (CHECKOUT_ENABLED); until then a paid-only
 * event collects "notify me when registration opens" sign-ups instead.
 */
export function RegistrationPanel({ event, registration, options = [], checkout = false }: {
  event: PublicEvent; registration: Registration; options?: TicketOption[]; checkout?: boolean;
}) {
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
    case "on_sale": {
      const onSale = options.filter((o) => o.display_state === "on_sale");
      const sellable = checkout ? onSale : onSale.filter((o) => o.price_cents === 0);
      if (sellable.length > 0) {
        const allFree = sellable.every((o) => o.price_cents === 0);
        return (
          <div className="space-y-4">
            <p className={heading}>{allFree ? "Register (free)" : "Get tickets"}</p>
            <TicketSelector slug={event.slug} maxAdmissions={event.max_tickets_per_order}
              tiers={sellable.map((o) => ({
                id: o.id, name: o.name, price_cents: o.price_cents, currency: o.currency, admits_per_unit: o.admits_per_unit, max_purchasable: o.max_purchasable,
              }))} />
            {sellable.length < onSale.length && (
              <p className="text-sm text-pp-cream/75">Paid ticket options are opening soon.</p>
            )}
          </div>
        );
      }
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
    }
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
