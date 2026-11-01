import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EventGrid, EventGridSkeleton, EventsUnavailable, loadSafely, withRegistration } from "@/components/events/EventSections";
import { PageHero } from "@/components/site/PageHero";
import { Container, cx, Eyebrow, LinkButton } from "@/components/ui/primitives";
import { DataUnavailableError, listPastEvents, listUpcomingEvents } from "@/server/data/events";

export const metadata: Metadata = {
  title: "Events",
  description: "Upcoming PynkPours experiences, gatherings and special activations.",
};

type View = "upcoming" | "past";

export default function EventsPage({ searchParams }: PageProps<"/events">) {
  return (
    <>
      <PageHero title="PynkPours" accent="Events" eyebrow="Curated gatherings • Real connections • Lasting opportunities" />
      <section className="bg-pp-blush-light py-16 text-pp-black sm:py-20">
        <Container>
          <div className="text-center">
            <Eyebrow tone="deep">The PynkPours event calendar</Eyebrow>
            <h2 className="mt-3 font-serif text-4xl italic sm:text-5xl">See what&apos;s coming up</h2>
          </div>
          <Suspense fallback={<><Tabs view="upcoming" /><EventGridSkeleton /></>}>
            <EventList searchParams={searchParams} />
          </Suspense>
        </Container>
      </section>
    </>
  );
}

async function EventList({ searchParams }: { searchParams: PageProps<"/events">["searchParams"] }) {
  const sp = await searchParams;
  const view: View = sp.view === "past" ? "past" : "upcoming";
  const res = await loadSafely(async () => withRegistration(view === "past" ? await listPastEvents() : await listUpcomingEvents()));
  return (
    <>
      <Tabs view={view} />
      {res instanceof DataUnavailableError ? <EventsUnavailable /> : res.length === 0 ? <Empty view={view} /> : <EventGrid items={res} />}
    </>
  );
}

function Tabs({ view }: { view: View }) {
  const tab = (v: View, label: string) => (
    <Link
      href={v === "upcoming" ? "/events" : "/events?view=past"}
      aria-current={view === v ? "page" : undefined}
      className={cx(
        "inline-flex min-h-11 flex-1 items-center justify-center border px-6 text-xs font-bold tracking-[0.18em] uppercase sm:flex-none sm:min-w-48",
        view === v ? "border-pp-pink-strong bg-pp-pink-strong text-white" : "border-pp-black/30 bg-white text-pp-black hover:border-pp-black",
      )}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Event views" className="my-10 flex gap-3 sm:justify-center">
      {tab("upcoming", "Upcoming events")}
      {tab("past", "Past events")}
    </nav>
  );
}

function Empty({ view }: { view: View }) {
  return (
    <div className="mx-auto max-w-2xl border border-pp-black/10 bg-white p-8 text-center sm:p-12">
      <h3 className="font-serif text-3xl">
        {view === "upcoming" ? "New experiences are being poured." : "No past events yet."}
      </h3>
      <p className="mt-4 text-pp-black/75">
        {view === "upcoming"
          ? "There are no events on the calendar right now. Join the list to be first to hear when the next PynkPours experience is announced."
          : "Once our first experiences have taken place, you'll find them here."}
      </p>
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <LinkButton href="/#newsletter">Join the PynkPours list</LinkButton>
        <LinkButton href="/experiences" variant="secondary-light">Explore our experiences</LinkButton>
      </div>
    </div>
  );
}
