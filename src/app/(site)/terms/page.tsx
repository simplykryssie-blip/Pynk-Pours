import type { Metadata } from "next";
import { PageHero } from "@/components/site/PageHero";
import { Container, LinkButton } from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Terms of Use", robots: { index: false } };

/** Placeholder until the owner supplies a policy reviewed by their advisers. Never invent policy terms. */
export default function Page() {
  return (
    <>
      <PageHero title="Terms of Use" />
      <section className="bg-pp-cream py-16 text-pp-black">
        <Container className="max-w-3xl space-y-4">
          <p className="text-lg">Our terms of use is being finalised and will be published here before tickets go on sale.</p>
          <p className="text-pp-black/75">If you have a question in the meantime, please reach out and we&apos;ll be happy to help.</p>
          <LinkButton href="/contact" variant="secondary-light">Contact us</LinkButton>
        </Container>
      </section>
    </>
  );
}
