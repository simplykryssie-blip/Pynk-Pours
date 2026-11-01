"use client";

import Link from "next/link";
import { useState } from "react";
import { buttonClass, cx } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/money";

export interface SelectableTier { id: string; name: string; price_cents: number; currency: string; admits_per_unit: number; max_purchasable: number }

/** Quantity picker. The server re-validates everything on the checkout page and again in the database. */
export function TicketSelector({ slug, tiers, maxAdmissions }: { slug: string; tiers: SelectableTier[]; maxAdmissions: number }) {
  const [qty, setQty] = useState<Record<string, number>>(() => (tiers.length === 1 ? { [tiers[0].id]: 1 } : {}));
  const admissions = tiers.reduce((a, t) => a + (qty[t.id] ?? 0) * t.admits_per_unit, 0);
  const total = tiers.reduce((a, t) => a + (qty[t.id] ?? 0) * t.price_cents, 0);
  const sel = tiers.filter((t) => (qty[t.id] ?? 0) > 0).map((t) => `${t.id}:${qty[t.id]}`).join(",");
  const set = (t: SelectableTier, n: number) => {
    const clamped = Math.max(0, Math.min(n, t.max_purchasable));
    const otherAdmissions = admissions - (qty[t.id] ?? 0) * t.admits_per_unit;
    if (clamped * t.admits_per_unit + otherAdmissions > maxAdmissions) return;
    setQty((q) => ({ ...q, [t.id]: clamped }));
  };
  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {tiers.map((t) => {
          const n = qty[t.id] ?? 0;
          return (
            <li key={t.id} className="flex items-center justify-between gap-3 border border-white/15 p-3">
              <div>
                <p className="font-semibold text-pp-cream">{t.name}</p>
                <p className="text-sm text-pp-cream/75">
                  {t.price_cents === 0 ? "Free" : formatMoney(t.price_cents, t.currency)}
                  {t.admits_per_unit > 1 && ` · admits ${t.admits_per_unit}`}
                </p>
              </div>
              <div className="flex items-center gap-2" role="group" aria-label={`Quantity for ${t.name}`}>
                <button type="button" onClick={() => set(t, n - 1)} disabled={n === 0} aria-label={`Fewer ${t.name}`}
                  className="size-10 border border-white/30 text-lg text-pp-cream disabled:opacity-40">−</button>
                <output className="w-6 text-center text-lg text-pp-cream" aria-live="polite" aria-label={`${t.name} quantity`}>{n}</output>
                <button type="button" onClick={() => set(t, n + 1)} disabled={n >= t.max_purchasable} aria-label={`More ${t.name}`}
                  className="size-10 border border-white/30 text-lg text-pp-cream disabled:opacity-40">+</button>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between text-pp-cream">
        <span>{admissions} guest{admissions === 1 ? "" : "s"}</span>
        <span className="font-serif text-2xl">{formatMoney(total, tiers[0]?.currency ?? "usd")}</span>
      </div>
      <Link
        href={sel ? `/events/${slug}/checkout?sel=${encodeURIComponent(sel)}` : "#"}
        aria-disabled={!sel}
        onClick={(e) => !sel && e.preventDefault()}
        className={cx(buttonClass("primary", "w-full"), !sel && "pointer-events-none opacity-50")}
      >
        Continue
      </Link>
      <p className="text-xs text-pp-cream/60">No account needed. You&apos;ll enter each guest&apos;s details next, then pay securely with Stripe.</p>
    </div>
  );
}
