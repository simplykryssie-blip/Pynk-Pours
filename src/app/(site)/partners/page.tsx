import type { Metadata } from "next";
import { partners } from "@/content/site";
import { ContactForm } from "@/components/forms/ContactForm";
import { PageHero } from "@/components/site/PageHero";
import { ArrowIcon, PeopleIcon, SparkIcon, GlassIcon } from "@/components/ui/icons";
import { Container, Eyebrow, LinkButton } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Partners & Sponsorships", description: partners.introBody };
const icons = [GlassIcon, PeopleIcon, SparkIcon];

export default function PartnersPage() {
  return (
    <>
      <PageHero title="Partner with" accent="PynkPours" eyebrow={partners.eyebrow}>
        <div className="mt-8"><LinkButton href="#inquiry">Become a partner <ArrowIcon width={16} height={16} /></LinkButton></div>
      </PageHero>
      <section className="bg-pp-blush-light py-20 text-pp-black">
        <Container className="text-center">
          <Eyebrow tone="deep">{partners.introEyebrow}</Eyebrow>
          <h2 className="mt-3 font-serif text-4xl italic sm:text-5xl">{partners.introTitle}</h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-pp-black/75">{partners.introBody}</p>
          <ul className="mt-14 grid gap-10 sm:grid-cols-3">
            {partners.benefits.map((b, i) => {
              const Icon = icons[i];
              return (
                <li key={b.title}>
                  <Icon width={36} height={36} className="mx-auto text-pp-pink-strong" />
                  <h3 className="mt-4 font-serif text-2xl">{b.title}</h3>
                  <p className="mt-2 text-pp-black/75">{b.body}</p>
                </li>
              );
            })}
          </ul>
        </Container>
      </section>
      <section id="inquiry" className="bg-pp-cream py-20 text-pp-black">
        <Container className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <Eyebrow tone="deep">Partnership inquiry</Eyebrow>
            <h2 className="mt-3 font-serif text-4xl">{partners.inquiryTitle}</h2>
            <p className="mt-4 text-pp-black/75">{partners.inquiryBody}</p>
          </div>
          <div className="bg-white p-6 sm:p-8"><ContactForm defaultTopic="partnership" submitLabel="Send inquiry" /></div>
        </Container>
      </section>
    </>
  );
}
