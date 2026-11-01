import type { Metadata } from "next";
import { experiences, home } from "@/content/site";
import { PageHero } from "@/components/site/PageHero";
import { ArrowIcon } from "@/components/ui/icons";
import { Container, Eyebrow, LinkButton } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Experiences", description: experiences.introBody };

export default function ExperiencesPage() {
  const s = home.signature;
  return (
    <>
      <PageHero title="The PynkPours" accent="Experience" eyebrow={experiences.eyebrow} />
      <section className="bg-pp-blush-light py-20 text-pp-black">
        <Container>
          <div className="text-center">
            <Eyebrow tone="deep">{experiences.introEyebrow}</Eyebrow>
            <h2 className="mt-3 font-serif text-4xl italic sm:text-5xl">{experiences.introTitle}</h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-pp-black/75">{experiences.introBody}</p>
          </div>
          <ul className="mt-14 grid gap-px border border-pp-gold/40 bg-pp-gold/40 sm:grid-cols-2 lg:grid-cols-3">
            {experiences.formats.map((f) => (
              <li key={f.title} className="bg-pp-black p-8 text-center">
                <h3 className="font-serif text-2xl text-pp-cream">{f.title}</h3>
                <p className="mt-3 text-pp-cream/75">{f.body}</p>
              </li>
            ))}
          </ul>
          <p className="mt-12 text-center text-xs font-bold tracking-[0.35em] text-pp-gold-deep uppercase">{experiences.closing}</p>
        </Container>
      </section>
      <section className="bg-pp-black py-20">
        <Container className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <div>
            <Eyebrow>{s.eyebrow}</Eyebrow>
            <h2 className="mt-4 font-serif text-4xl text-pp-cream sm:text-5xl">{s.title}</h2>
          </div>
          <div className="space-y-4">
            <p className="font-serif text-2xl text-pp-cream italic">{s.lead}</p>
            <p className="text-pp-cream/80">{s.body}</p>
            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <LinkButton href={`/events/${s.slug}`}>Get event updates <ArrowIcon width={16} height={16} /></LinkButton>
              <LinkButton href="/events" variant="secondary">See all events</LinkButton>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
