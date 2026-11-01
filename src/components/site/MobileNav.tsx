"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { CloseIcon, MenuIcon } from "@/components/ui/icons";
import { buttonClass, cx } from "@/components/ui/primitives";

type Item = { href: string; label: string };

export function MobileNav({ items }: { items: readonly Item[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [lastPath, setLastPath] = useState(pathname);

  // Close on navigation (state derived from the previous render's pathname).
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        ref={buttonRef}
        type="button"
        className="inline-flex size-11 items-center justify-center text-pp-cream"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <CloseIcon width={26} height={26} /> : <MenuIcon width={26} height={26} />}
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="fixed inset-x-0 top-[72px] bottom-0 z-40 overflow-y-auto border-t border-white/10 bg-pp-black px-6 py-8"
      >
        <nav aria-label="Mobile">
          <ul className="flex flex-col gap-1">
            {items.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={cx(
                      "block border-b border-white/10 py-4 font-serif text-2xl",
                      active ? "text-pp-pink" : "text-pp-cream",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link href="/events" onClick={() => setOpen(false)} className={buttonClass("primary", "mt-8 w-full")}>
            Explore events
          </Link>
        </nav>
      </div>
    </div>
  );
}

/** Suspense fallback: the closed menu button (becomes interactive after hydration). */
export function MobileNavFallback() {
  return (
    <div className="lg:hidden">
      <button type="button" className="inline-flex size-11 items-center justify-center text-pp-cream" aria-label="Open menu" aria-expanded={false}>
        <MenuIcon width={26} height={26} />
      </button>
    </div>
  );
}
