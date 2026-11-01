/**
 * Single source of truth for an event's public registration state and CTA.
 * Pure function: unit-tested, used by event cards and event pages.
 */
export type RegistrationState =
  | "on_sale" | "not_yet_on_sale" | "coming_soon" | "sold_out" | "waitlist"
  | "closed" | "cancelled" | "past";

export interface RegistrationInput {
  status: "draft" | "published" | "cancelled" | "completed";
  registration_mode: "tickets" | "coming_soon" | "closed";
  sold_out_behavior: "sold_out" | "waitlist";
  starts_at: string | null;
  ends_at: string | null;
}

export interface OptionInput {
  display_state: string;
  price_cents: number;
  sales_start_at: string | null;
}

export interface Registration {
  state: RegistrationState;
  /** Short status label for badges, e.g. "Coming soon". */
  label: string;
  /** Lowest price among currently purchasable options, in cents. */
  fromPriceCents: number | null;
  /** Earliest future sales start among scheduled options. */
  salesOpenAt: string | null;
}

const LABELS: Record<RegistrationState, string> = {
  on_sale: "Tickets available",
  not_yet_on_sale: "Tickets coming soon",
  coming_soon: "Coming soon",
  sold_out: "Sold out",
  waitlist: "Sold out — join the waitlist",
  closed: "Registration closed",
  cancelled: "Cancelled",
  past: "Past event",
};

export function deriveRegistration(
  event: RegistrationInput,
  options: OptionInput[],
  now: Date = new Date(),
): Registration {
  const make = (state: RegistrationState, extra: Partial<Registration> = {}): Registration => ({
    state, label: LABELS[state], fromPriceCents: null, salesOpenAt: null, ...extra,
  });

  if (event.status === "cancelled") return make("cancelled");
  const end = event.ends_at ?? event.starts_at;
  if (event.status === "completed" || (end && new Date(end) < now)) return make("past");
  if (event.registration_mode === "coming_soon") return make("coming_soon");
  if (event.registration_mode === "closed") return make("closed");

  const onSale = options.filter((o) => o.display_state === "on_sale");
  if (onSale.length > 0) {
    return make("on_sale", { fromPriceCents: Math.min(...onSale.map((o) => o.price_cents)) });
  }
  const scheduled = options
    .filter((o) => o.display_state === "scheduled" && o.sales_start_at)
    .map((o) => o.sales_start_at as string)
    .sort();
  if (scheduled.length > 0) return make("not_yet_on_sale", { salesOpenAt: scheduled[0] });
  if (options.some((o) => o.display_state === "sold_out")) {
    return make(event.sold_out_behavior === "waitlist" ? "waitlist" : "sold_out");
  }
  return make("closed");
}
