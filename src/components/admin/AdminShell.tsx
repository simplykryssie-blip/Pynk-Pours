import Image from "next/image";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { signOut } from "@/server/auth/actions";
import type { Staff } from "@/server/auth/staff";
import { publicSiteUrl } from "@/lib/site-url";
import { AdminMobileNav, AdminSideNav } from "./AdminNav";
import { ADMIN_NAV, ROLE_LABEL } from "./nav";

function Brand() {
  return (
    <Link href="/admin" className="flex items-center gap-2.5">
      <Image src="/brand/pynkpours-emblem.jpg" alt="" width={36} height={36} className="rounded-full" />
      <span className="font-serif text-lg text-pp-cream">PynkPours <span className="text-xs tracking-[0.2em] text-pp-gold uppercase">Admin</span></span>
    </Link>
  );
}

function UserBox({ staff }: { staff: Staff }) {
  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="font-medium text-pp-cream">{staff.displayName}</p>
        <p className="text-xs text-pp-muted">{ROLE_LABEL[staff.role]}</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <a href={publicSiteUrl("/")} className="text-xs text-pp-cream/75 underline-offset-4 hover:underline">View site</a>
        <form action={signOut}>
          <button type="submit" className="text-xs text-pp-cream/75 underline-offset-4 hover:underline">Sign out</button>
        </form>
      </div>
    </div>
  );
}

/** Admin chrome: fixed sidebar on desktop, compact top bar + drawer on phones. */
export function AdminShell({ staff, children }: { staff: Staff; children: ReactNode }) {
  const items = ADMIN_NAV.filter((i) => i.roles.includes(staff.role));
  return (
    <div className="min-h-dvh bg-[#f6f2ef] text-pp-black">
      <header className="sticky top-0 z-50 flex h-14 items-center justify-between bg-pp-black px-4 lg:hidden">
        <Brand />
        <Suspense fallback={null}><AdminMobileNav items={items} footer={<UserBox staff={staff} />} /></Suspense>
      </header>
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col justify-between bg-pp-black p-5 lg:flex">
        <div className="space-y-8">
          <Brand />
          <nav aria-label="Admin"><Suspense fallback={null}><AdminSideNav items={items} /></Suspense></nav>
        </div>
        <UserBox staff={staff} />
      </aside>
      <main id="main" className="px-4 py-6 sm:px-6 lg:ml-60 lg:px-10 lg:py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
