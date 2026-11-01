import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CheckoutForm, type CheckoutLine, type CheckoutQuestion } from "@/components/checkout/CheckoutForm";
import { eventWhen, eventWhere } from "@/components/events/format";
import { Container, Eyebrow, LinkButton } from "@/components/ui/primitives";
import { parseSelectionParam } from "@/lib/checkout-schema";
import { getEventBySlug, getTicketOptions } from "@/server/data/events";
import { checkoutEnabled } from "@/server/payments/stripe";
import { publicDb } from "@/server/supabase";

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };

export default function CheckoutPage(props: PageProps<"/events/[slug]/checkout">) {
  return (
    <Suspense fallback={<Container className="py-20"><p role="status" className="text-pp-cream">Loading checkout…</p></Container>}>
      <Checkout {...props} />
    </Suspense>
  );
}

async function Checkout({ params, searchParams }: PageProps<"/events/[slug]/checkout">) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const event = await getEventBySlug(slug);
  if (!event) notFound();
  const back = `/events/${slug}`;
  const problem = (msg: string) => (
    <Container className="py-20 text-center">
      <Eyebrow>Checkout</Eyebrow>
      <p className="mt-4 font-serif text-3xl text-pp-cream">{msg}</p>
      <div className="mt-8"><LinkButton href={back}>Back to the event</LinkButton></div>
    </Container>
  );
  if (!checkoutEnabled()) return problem("Online registration isn't open yet.");
  const sel = parseSelectionParam(typeof sp.sel === "string" ? sp.sel : null);
  if (!sel) return problem("Please choose your tickets first.");
  const options = await getTicketOptions(event.id);
  const lines: CheckoutLine[] = [];
  for (const s of sel) {
    const o = options.find((x) => x.id === s.ticket_type_id);
    if (!o || o.display_state !== "on_sale") return problem("One of your tickets is no longer on sale.");
    if (s.quantity > o.max_purchasable) return problem(`Only ${o.max_purchasable} “${o.name}” can be purchased right now.`);
    lines.push({ ticket_type_id: o.id, name: o.name, unit_price_cents: o.price_cents, quantity: s.quantity, admits_per_unit: o.admits_per_unit });
  }
  if (lines.reduce((a, l) => a + l.quantity * l.admits_per_unit, 0) > event.max_tickets_per_order) return problem("That's more than the per-order limit.");
  const { data: qs } = await publicDb().from("event_questions").select("id, label, help_text, kind, options, is_required").eq("event_id", event.id).order("sort_order");
  const when = eventWhen(event);
  return (
    <section className="bg-pp-blush-light text-pp-black">
      <Container className="py-10 sm:py-14">
        <Link href={back} className="text-sm text-pp-black/70 hover:text-pp-pink-strong">← Back to event</Link>
        <h1 className="mt-3 font-serif text-4xl">Your registration</h1>
        <p className="mt-1 text-pp-black/75">{event.title} · {when.date}{when.time ? ` · ${when.time}` : ""} · {eventWhere(event)}</p>
        <p className="mt-1 text-sm text-pp-black/60">No account needed. Each guest gets their own ticket.</p>
        <div className="mt-8">
          <CheckoutForm slug={slug} lines={lines} questions={(qs ?? []) as CheckoutQuestion[]} currency={event.currency} minAge={event.min_age} holdMinutes={35} />
        </div>
      </Container>
    </section>
  );
}
