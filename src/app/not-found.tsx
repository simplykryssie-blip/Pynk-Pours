import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Container, Eyebrow, LinkButton } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="bg-pp-black">
        <Container className="py-28 text-center">
          <Eyebrow>Page not found</Eyebrow>
          <h1 className="mt-4 font-serif text-4xl text-pp-cream sm:text-5xl">This pour has run dry.</h1>
          <p className="mt-4 text-pp-cream/75">The page you&apos;re looking for doesn&apos;t exist or is no longer available.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <LinkButton href="/">Back to home</LinkButton>
            <LinkButton href="/events" variant="secondary">Explore events</LinkButton>
          </div>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
