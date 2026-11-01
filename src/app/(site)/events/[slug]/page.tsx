import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { loadSafely } from "@/components/events/EventSections";
import { EventView } from "@/components/events/EventView";
import { Container, Eyebrow } from "@/components/ui/primitives";
import { deriveRegistration } from "@/lib/registration";
import { DataUnavailableError, getEventBySlug, getGallery, getTicketOptions } from "@/server/data/events";
import { checkoutEnabled } from "@/server/payments/stripe";

export async function generateMetadata({ params }: PageProps<"/events/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const event = await loadSafely(() => getEventBySlug(slug));
  if (event instanceof DataUnavailableError || !event) return { title: "Event" };
  return {
    title: event.title,
    description: event.short_description ?? undefined,
    openGraph: { title: event.title, description: event.short_description ?? undefined, type: "website" },
  };
}

/**
 * The event body streams in after the static shell. Because the shell has
 * already been sent, unknown/unpublished slugs render the not-found UI with a
 * `noindex` robots tag (HTTP status stays 200 — a known streaming trade-off,
 * documented in docs/QA_REPORT.md).
 */
export default function EventPage({ params }: PageProps<"/events/[slug]">) {
  return (
    <Suspense fallback={<EventSkeleton />}>
      <EventContent params={params} />
    </Suspense>
  );
}

async function EventContent({ params }: { params: PageProps<"/events/[slug]">["params"] }) {
  const { slug } = await params;
  const event = await loadSafely(() => getEventBySlug(slug));
  if (event instanceof DataUnavailableError) return <Unavailable />;
  if (!event) notFound();
  const data = await loadSafely(async () => ({
    options: event.registration_mode === "tickets" ? await getTicketOptions(event.id) : [],
    gallery: await getGallery(event.id),
  }));
  if (data instanceof DataUnavailableError) return <Unavailable />;
  return (
    <EventView event={event} options={data.options} gallery={data.gallery}
      registration={deriveRegistration(event, data.options)} checkout={checkoutEnabled()} />
  );
}

function Unavailable() {
  return (
    <Container className="py-24 text-center">
      <Eyebrow>Temporarily unavailable</Eyebrow>
      <p className="mt-4 font-serif text-3xl text-pp-cream">We couldn&apos;t load this event right now.</p>
      <p className="mt-3 text-pp-cream/75">Please refresh the page or try again shortly.</p>
    </Container>
  );
}
function EventSkeleton() {
  return (
    <Container className="py-16">
      <div aria-hidden className="space-y-6">
        <div className="h-6 w-32 animate-pulse bg-white/10" />
        <div className="h-14 w-3/4 animate-pulse bg-white/10" />
        <div className="aspect-[16/9] w-full animate-pulse bg-white/10" />
      </div>
      <p className="sr-only" role="status">Loading event…</p>
    </Container>
  );
}
