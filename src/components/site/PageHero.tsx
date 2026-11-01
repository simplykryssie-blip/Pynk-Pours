import type { ReactNode } from "react";
import { Container, Eyebrow } from "@/components/ui/primitives";

/** Dark editorial page header used by inner pages. Typographic — no stock imagery. */
export function PageHero({ title, accent, eyebrow, children }: {
  title: string; accent?: string; eyebrow?: string; children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden bg-pp-black">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_80%_20%,var(--pp-plum)_0,transparent_60%)]" />
      <Container className="relative py-16 sm:py-24">
        <h1 className="max-w-3xl font-serif text-4xl leading-[1.05] text-pp-cream sm:text-6xl">
          {title}
          {accent && <> <em className="text-pp-pink not-italic sm:italic">{accent}</em></>}
        </h1>
        {eyebrow && <Eyebrow className="mt-6">{eyebrow}</Eyebrow>}
        {children}
      </Container>
    </section>
  );
}
