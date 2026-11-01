import Image from "next/image";
import type { ReactNode } from "react";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center bg-pp-black bg-[radial-gradient(ellipse_at_50%_0%,var(--pp-plum)_0,transparent_60%)] px-4 py-10">
      <div className="w-full max-w-sm space-y-6 rounded-sm border border-pp-gold/30 bg-pp-charcoal p-6 sm:p-8">
        <div className="text-center">
          <Image src="/brand/pynkpours-emblem.jpg" alt="PynkPours" width={88} height={88} className="mx-auto rounded-full" priority />
          <h1 className="mt-4 font-serif text-2xl text-pp-cream">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-pp-cream/70">{subtitle}</p>}
        </div>
        {children}
      </div>
    </main>
  );
}
