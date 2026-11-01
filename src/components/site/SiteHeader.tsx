import { Suspense } from "react";
import { nav } from "@/content/site";
import { Container, LinkButton } from "@/components/ui/primitives";
import { DesktopNav, DesktopNavLinks } from "./DesktopNav";
import { Logo } from "./Logo";
import { MobileNav, MobileNavFallback } from "./MobileNav";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-pp-black/95 backdrop-blur supports-[backdrop-filter]:bg-pp-black/85">
      <Container className="flex h-[72px] items-center justify-between gap-6">
        <Logo size={44} />
        <Suspense fallback={<DesktopNavLinks items={nav} />}><DesktopNav items={nav} /></Suspense>
        <div className="flex items-center gap-2">
          {/* Wrapper controls visibility: the button's own display class would override `hidden`. */}
          <div className="hidden sm:block">
            <LinkButton href="/events" className="px-5">Explore events</LinkButton>
          </div>
          <Suspense fallback={<MobileNavFallback />}><MobileNav items={nav} /></Suspense>
        </div>
      </Container>
    </header>
  );
}
