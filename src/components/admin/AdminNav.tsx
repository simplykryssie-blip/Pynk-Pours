"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CloseIcon, MenuIcon } from "@/components/ui/icons";
import { cx } from "@/components/ui/primitives";
import type { AdminNavItem } from "./nav";

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);
}

function Links({ items, pathname, onNavigate }: { items: AdminNavItem[]; pathname: string; onNavigate?: () => void }) {
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cx(
                "block rounded-sm px-3 py-2.5 text-sm font-medium",
                active ? "bg-pp-pink-strong text-white" : "text-pp-cream/85 hover:bg-white/10",
              )}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function AdminSideNav({ items }: { items: AdminNavItem[] }) {
  return <Links items={items} pathname={usePathname()} />;
}

export function AdminMobileNav({ items, footer }: { items: AdminNavItem[]; footer: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="admin-mobile-nav"
        aria-label={open ? "Close admin menu" : "Open admin menu"}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex size-11 items-center justify-center text-pp-cream"
      >
        {open ? <CloseIcon width={24} height={24} /> : <MenuIcon width={24} height={24} />}
      </button>
      <div id="admin-mobile-nav" hidden={!open} className="fixed inset-x-0 top-14 bottom-0 z-40 overflow-y-auto bg-pp-black p-4">
        <nav aria-label="Admin mobile"><Links items={items} pathname={pathname} onNavigate={() => setOpen(false)} /></nav>
        <div className="mt-6 border-t border-white/10 pt-4">{footer}</div>
      </div>
    </div>
  );
}
