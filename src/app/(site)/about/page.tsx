import type { Metadata } from "next";
import Image from "next/image";
import { about, brand } from "@/content/site";
import { PageHero } from "@/components/site/PageHero";
import { PeopleIcon, SparkIcon } from "@/components/ui/icons";
import { Container, Eyebrow, LinkButton } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "About", description: about.mission.body };

export default function AboutPage() {
  return (
    <>
      <PageHero title="About" accent="PynkPours" eyebrow={about.eyebrow} />
      <section className="bg-pp-blush-light py-20 text-pp-black">
        <Container className="grid items-center gap-12 lg:grid-cols-[1fr_1.2fr]">
          <div className="flex justify-center">
            <Image src="/brand/pynkpours-emblem.jpg" alt="The PynkPours emblem" width={1254} height={1254}
              sizes="(max-width: 1024px) 70vw, 380px" className="h-auto w-[min(70vw,380px)] rounded-full" />
          </div>
          <div>
            <Eyebrow tone="deep">{about.storyEyebrow}</Eyebrow>
            <h2 className="mt-4 font-serif text-4xl italic sm:text-5xl">{about.storyTitle}</h2>
            <p className="mt-6 text-lg leading-relaxed text-pp-black/80">{about.story}</p>
            <p className="mt-6 text-sm tracking-[0.3em] text-pp-gold-deep uppercase">{brand.tagline}</p>
          </div>
        </Container>
      </section>
      <section className="bg-pp-cream py-20 text-pp-black">
        <Container className="grid gap-10 sm:grid-cols-2 sm:divide-x sm:divide-pp-gold/50">
          {[{ ...about.mission, Icon: SparkIcon }, { ...about.vision, Icon: PeopleIcon }].map(({ title, body, Icon }) => (
            <div key={title} className="px-2 text-center sm:px-10">
              <Icon width={40} height={40} className="mx-auto text-pp-pink-strong" />
              <h2 className="mt-4 font-serif text-3xl uppercase">{title}</h2>
              <p className="mt-3 text-lg text-pp-black/80">{body}</p>
            </div>
          ))}
        </Container>
        <Container className="mt-16 flex flex-col justify-center gap-3 sm:flex-row">
          <LinkButton href="/events">Explore events</LinkButton>
          <LinkButton href="/contact" variant="secondary-light">Get in touch</LinkButton>
        </Container>
      </section>
    </>
  );
}
