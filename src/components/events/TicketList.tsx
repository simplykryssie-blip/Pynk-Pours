import { CheckIcon } from "@/components/ui/icons";
import { Badge, cx } from "@/components/ui/primitives";
import { formatEventDate } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import type { TicketDisplayState, TicketOption } from "@/server/data/events";

const stateLabel: Record<TicketDisplayState, string | null> = {
  on_sale: null,
  scheduled: "Sales open soon",
  ended: "Sales ended",
  paused: "Temporarily unavailable",
  closed: "Closed",
  sold_out: "Sold out",
  coming_soon: "Coming soon",
};

/** Read-only ticket tiers. Purchasing (quantity + checkout) arrives in Stage D. */
export function TicketList({ options, timezone }: { options: TicketOption[]; timezone: string | null }) {
  if (options.length === 0) return null;
  return (
    <ul className="grid gap-4">
      {options.map((o) => {
        const label = stateLabel[o.display_state];
        const available = o.display_state === "on_sale";
        return (
          <li key={o.id} className={cx("border p-5", available ? "border-pp-pink-strong/40 bg-white" : "border-pp-black/10 bg-white/60")}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-pp-black">{o.name}</h3>
                {o.admits_per_unit > 1 && <p className="text-sm text-pp-black/70">Admits {o.admits_per_unit} guests</p>}
              </div>
              <p className="shrink-0 text-lg font-semibold text-pp-black">
                {o.price_cents === 0 ? "Free" : formatMoney(o.price_cents, o.currency)}
              </p>
            </div>
            {o.description && <p className="mt-2 text-sm text-pp-black/75">{o.description}</p>}
            {o.inclusions.length > 0 && (
              <ul className="mt-3 space-y-1.5 text-sm text-pp-black/80">
                {o.inclusions.map((inc) => (
                  <li key={inc} className="flex gap-2"><CheckIcon className="mt-0.5 shrink-0 text-pp-pink-strong" width={16} height={16} />{inc}</li>
                ))}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {label && <Badge tone="dark">{label}</Badge>}
              {o.display_state === "scheduled" && o.sales_start_at && timezone && (
                <span className="text-pp-black/70">Opens {formatEventDate(o.sales_start_at, timezone)}</span>
              )}
              {available && o.remaining !== null && o.remaining <= 20 && (
                <span className="font-semibold text-pp-pink-strong">Only {o.remaining} left</span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
