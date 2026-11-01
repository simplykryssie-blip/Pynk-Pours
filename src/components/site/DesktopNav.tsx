"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui/primitives";

type Items = readonly { href: string; label: string }[];

export function DesktopNav({ items }: { items: Items }) {
  return <DesktopNavLinks items={items} pathname={usePathname()} />;
}

/** Presentational links; also used as the Suspense fallback (no active state). */
export function DesktopNavLinks({ items, pathname }: { items: Items; pathname?: string }) {
  return (
    <nav aria-label="Primary" className="hidden lg:block">
      <ul className="flex items-center gap-7">
        {items.map((item) => {
          const active = pathname !== undefined && (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href));
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative py-2 text-[0.72rem] font-semibold tracking-[0.18em] uppercase transition-colors",
                  "hover:text-pp-pink",
                  active
                    ? "text-pp-cream after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:bg-pp-pink-strong"
                    : "text-pp-cream/80",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
