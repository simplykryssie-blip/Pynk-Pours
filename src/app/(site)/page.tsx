import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { home } from "@/content/site";
import { NewsletterForm } from "@/components/forms/NewsletterForm";
import { EventCover } from "@/components/events/EventCover";
import { EventGridSkeleton, loadSafely, UpcomingStrip, withRegistration } from "@/components/events/EventSections";
import { eventWhen, eventWhere } from "@/components/events/format";
import { ArrowIcon, CalendarIcon, GlassIcon, PeopleIcon, PinIcon, SparkIcon } from "@/components/ui/icons";
import { Badge, Container, Eyebrow, LinkButton } from "@/components/ui/primitives";
import { DataUnavailableError, getFeaturedEvent } from "@/server/data/events";

const pillarIcons = [GlassIcon, PeopleIcon, SparkIcon];

export default function HomePage() {
  const { hero, marquee, intro, pillars, newsletter } = home;
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-pp-black">
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_75%_45%,#4b1633_0,#1a1018_38%,var(--pp-black)_72%)]" />
        <Container className="relative grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
          <div>
            <Eyebrow>{hero.eyebrow}</Eyebrow>
            <h1 className="mt-6 font-serif text-5xl leading-[1.02] text-pp-cream sm:text-7xl">
              {hero.titleLead} <em className="text-pp-pink">{hero.titleAccent}</em>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-pp-cream/80">{hero.body}</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <LinkButton href={hero.primaryCta.href}>{hero.primaryCta.label} <ArrowIcon width={16} height={16} /></LinkButton>
              <LinkButton href={hero.secondaryCta.href} variant="secondary">{hero.secondaryCta.label}</LinkButton>
            </div>
          </div>
          <div className="flex justify-center">
            <Image
              src="/brand/pynkpours-emblem.jpg"
              alt="PynkPours — Where Ideas Meet Opportunity. Sip • Connect • Create."
              width={1254} height={1254} priority
              sizes="(max-width: 1024px) 80vw, 460px"
              className="h-auto w-[min(80vw,460px)] rounded-full shadow-[0_0_80px_rgba(200,164,93,0.18)]"
            />
          </div>
        </Container>
      </section>

      {/* Marquee band */}
      <div className="bg-gradient-to-r from-[#a8853f] via-pp-gold to-[#a8853f] py-4">
        <p className="text-center text-xs font-bold tracking-[0.35em] text-pp-black uppercase sm:text-sm">
          {marquee.join("  •  ")}
        </p>
      </div>

      {/* Intro + pillars */}
      <section className="bg-pp-blush-light py-20 text-pp-black sm:py-24">
        <Container className="text-center">
          <Eyebrow tone="deep">{intro.eyebrow}</Eyebrow>
          <h2 className="mt-4 font-serif text-4xl sm:text-5xl">
            {intro.title} <em className="text-pp-pink-strong">{intro.titleAccent}</em>
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-pp-black/75">{intro.body}</p>
          <ul className="mt-14 grid gap-10 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-pp-gold/50">
            {pillars.map((p, i) => {
              const Icon = pillarIcons[i];
              return (
                <li key={p.title} className="px-6">
                  <Icon width={36} height={36} className="mx-auto text-pp-pink-strong" />
                  <h3 className="mt-4 font-serif text-3xl uppercase">{p.title}</h3>
                  <p className="mt-3 text-pp-black/75">{p.body}</p>
                </li>
              );
            })}
          </ul>
        </Container>
      </section>

      {/* Featured experience */}
      <section aria-labelledby="featured-heading" className="bg-pp-black py-20 sm:py-24">
        <Container>
          <Suspense fallback={<SignatureTeaser />}>
            <Featured />
          </Suspense>
        </Container>
      </section>

      {/* More upcoming events (only if there are any) */}
      <Suspense fallback={null}>
        <UpcomingSection />
      </Suspense>

      {/* Newsletter */}
      <section id="newsletter" className="bg-pp-blush-light py-20 text-pp-black">
        <Container className="max-w-3xl text-center">
          <Eyebrow tone="deep">{newsletter.eyebrow}</Eyebrow>
          <h2 className="mt-4 font-serif text-3xl italic sm:text-5xl">{newsletter.title}</h2>
          <p className="mx-auto mt-5 max-w-2xl text-pp-black/75">{newsletter.body}</p>
          <div className="mx-auto mt-8 max-w-xl text-left"><NewsletterForm source="home" /></div>
        </Container>
      </section>
    </>
  );
}

/** Featured upcoming event from the database; falls back to the signature teaser. */
async function Featured() {
  const res = await loadSafely(async () => {
    const e = await getFeaturedEvent();
    return e ? (await withRegistration([e]))[0] : null;
  });
  if (res instanceof DataUnavailableError || !res) return <SignatureTeaser />;
  const { event, registration } = res;
  const when = eventWhen(event);
  return (
    <div className="grid overflow-hidden border border-white/10 lg:grid-cols-2">
      <EventCover event={event} className="min-h-72 lg:min-h-[420px]" />
      <div className="flex flex-col justify-center gap-5 bg-pp-charcoal p-8 sm:p-12">
        <div className="flex flex-wrap gap-2">
          <Badge>{event.category_label ?? "Featured experience"}</Badge>
          <Badge tone="muted">{registration.label}</Badge>
        </div>
        <h2 id="featured-heading" className="font-serif text-4xl leading-tight text-pp-cream sm:text-5xl">{event.title}</h2>
        {event.short_description && <p className="text-pp-cream/80">{event.short_description}</p>}
        <ul className="space-y-2 text-sm text-pp-cream/85">
          <li className="flex items-center gap-2"><CalendarIcon className="text-pp-pink" />{when.date}{when.time ? ` · ${when.time}` : ""}</li>
          <li className="flex items-center gap-2"><PinIcon className="text-pp-pink" />{eventWhere(event)}</li>
        </ul>
        <div>
          <LinkButton href={`/events/${event.slug}`}>
            {registration.state === "coming_soon" ? "Get event updates" : registration.state === "on_sale" ? "Get tickets" : "View details"}
            <ArrowIcon width={16} height={16} />
          </LinkButton>
        </div>
      </div>
    </div>
  );
}

/** Static Entrepreneurial Brunch teaser — owner brand copy only, no event details. */
function SignatureTeaser() {
  const s = home.signature;
  return (
    <div className="grid gap-10 border border-white/10 bg-pp-charcoal p-8 sm:p-12 lg:grid-cols-2 lg:items-center">
      <div>
        <Eyebrow>{s.eyebrow}</Eyebrow>
        <h2 id="featured-heading" className="mt-4 font-serif text-4xl leading-tight text-pp-cream sm:text-5xl">{s.title}</h2>
      </div>
      <div className="space-y-4">
        <p className="text-xs font-semibold tracking-[0.25em] text-pp-gold uppercase">Featured experience · Coming soon</p>
        <p className="font-serif text-2xl text-pp-cream italic">{s.lead}</p>
        <p className="text-pp-cream/80">{s.body}</p>
        <p className="text-sm text-pp-cream/60">{s.note}</p>
        <Link href="#newsletter" className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.15em] text-pp-pink uppercase hover:underline">
          Get event updates <ArrowIcon width={16} height={16} />
        </Link>
      </div>
    </div>
  );
}

async function UpcomingSection() {
  const featured = await loadSafely(getFeaturedEvent);
  const excludeId = featured instanceof DataUnavailableError ? undefined : featured?.id;
  const strip = await UpcomingStrip({ excludeId });
  if (!strip) return null;
  return (
    <section aria-labelledby="upcoming-heading" className="bg-pp-cream py-20 text-pp-black">
      <Container>
        <div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <Eyebrow tone="deep">The PynkPours calendar</Eyebrow>
            <h2 id="upcoming-heading" className="mt-3 font-serif text-4xl">See what&apos;s coming up</h2>
          </div>
          <LinkButton href="/events" variant="secondary-light">All events</LinkButton>
        </div>
        <Suspense fallback={<EventGridSkeleton />}>{strip}</Suspense>
      </Container>
    </section>
  );
}
