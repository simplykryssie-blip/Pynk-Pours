import Link from "next/link";
import { cacheLife } from "next/cache";
import { brand, contactDetails, home, nav } from "@/content/site";
import { NewsletterForm } from "@/components/forms/NewsletterForm";
import { Container, Eyebrow } from "@/components/ui/primitives";
import { Logo } from "./Logo";
import { SocialLinks } from "./SocialLinks";

export function SiteFooter() {
  return (
    <footer className="border-t border-pp-gold/30 bg-pp-black text-pp-cream">
      <Container className="grid gap-12 py-14 md:grid-cols-[1.2fr_1fr_1.2fr]">
        <div>
          <Logo size={56} />
          <p className="mt-5 font-serif text-lg text-pp-cream/90">{brand.positioning}</p>
          <p className="mt-2 text-xs tracking-[0.3em] text-pp-gold uppercase">{brand.tagline}</p>
        </div>
        <nav aria-label="Footer">
          <Eyebrow>Quick links</Eyebrow>
          <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {nav.map((n) => (
              <li key={n.href}><Link href={n.href} className="text-pp-cream/80 hover:text-pp-pink">{n.label}</Link></li>
            ))}
          </ul>
          {contactDetails.email && (
            <p className="mt-6 text-sm"><a className="text-pp-cream/80 hover:text-pp-pink" href={`mailto:${contactDetails.email}`}>{contactDetails.email}</a></p>
          )}
          {contactDetails.location && <p className="mt-2 text-sm text-pp-cream/70">{contactDetails.location}</p>}
          <SocialLinks className="mt-4" />
        </nav>
        <div>
          <Eyebrow>{home.newsletter.eyebrow}</Eyebrow>
          <p className="mt-4 mb-4 text-sm text-pp-cream/80">Be first to hear about upcoming gatherings and experiences.</p>
          <NewsletterForm source="footer" tone="dark" stacked />
        </div>
      </Container>
      <div className="border-t border-white/10">
        <Container className="flex flex-col gap-3 py-6 text-xs text-pp-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© <CopyrightYear /> PynkPours. All rights reserved.</p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            <li><Link href="/privacy" className="hover:text-pp-pink">Privacy</Link></li>
            <li><Link href="/terms" className="hover:text-pp-pink">Terms</Link></li>
            <li><Link href="/refunds" className="hover:text-pp-pink">Refund policy</Link></li>
          </ul>
        </Container>
      </div>
    </footer>
  );
}

async function CopyrightYear() {
  "use cache";
  cacheLife("days");
  return <>{new Date().getUTCFullYear()}</>;
}
