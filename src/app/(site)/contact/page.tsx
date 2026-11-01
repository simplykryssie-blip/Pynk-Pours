import type { Metadata } from "next";
import { contact, contactDetails } from "@/content/site";
import { ContactForm } from "@/components/forms/ContactForm";
import { PageHero } from "@/components/site/PageHero";
import { MailIcon, PinIcon } from "@/components/ui/icons";
import { SocialLinks } from "@/components/site/SocialLinks";
import { Container, Eyebrow } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Contact", description: contact.body };

export default function ContactPage() {
  return (
    <>
      <PageHero title="Contact" accent="PynkPours" eyebrow={contact.eyebrow} />
      <section className="bg-pp-blush-light py-16 text-pp-black sm:py-20">
        <Container className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <Eyebrow tone="deep">{contact.formEyebrow}</Eyebrow>
            <h2 className="mt-3 font-serif text-4xl italic">{contact.formTitle}</h2>
            <p className="mt-4 text-pp-black/75">{contact.body}</p>
            {contactDetails.email && (
              <p className="mt-6 flex items-center gap-3">
                <MailIcon className="text-pp-pink-strong" />
                <a href={`mailto:${contactDetails.email}`} className="underline-offset-4 hover:underline">{contactDetails.email}</a>
              </p>
            )}
            {contactDetails.location && (
              <p className="mt-3 flex items-center gap-3">
                <PinIcon className="text-pp-pink-strong" />
                <span>{contactDetails.location}</span>
              </p>
            )}
            <div className="mt-6">
              <p className="text-sm font-medium text-pp-black/80">Follow along</p>
              <SocialLinks tone="light" className="mt-2" />
            </div>
          </div>
          <div className="bg-white p-6 sm:p-8"><ContactForm /></div>
        </Container>
      </section>
    </>
  );
}
