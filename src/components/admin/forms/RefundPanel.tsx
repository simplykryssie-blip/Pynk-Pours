"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { formatMoney } from "@/lib/money";
import { refundTickets } from "@/server/admin/refunds";
import type { ActionState } from "@/server/admin/common";
import { Notice, smallButton } from "../ui";

export interface RefundableTicket { id: string; label: string; share_cents: number }

function Submit({ label, variant }: { label: string; variant: "primary" | "danger" }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className={smallButton(variant)}>{pending ? "Refunding…" : label}</button>;
}

export function RefundPanel({ orderId, tickets, currency, remainingCents, free }: {
  orderId: string; tickets: RefundableTicket[]; currency: string; remainingCents: number; free: boolean;
}) {
  const [state, action] = useActionState<ActionState, FormData>(refundTickets, { status: "idle" });
  const [picked, setPicked] = useState<string[]>([]);
  const amount = Math.min(remainingCents, tickets.filter((t) => picked.includes(t.id)).reduce((a, t) => a + t.share_cents, 0));
  const verb = free ? "Cancel" : "Refund";
  if (tickets.length === 0) return <p className="text-sm text-pp-black/70">No valid tickets left to {verb.toLowerCase()}.</p>;
  return (
    <form action={action} className="space-y-4"
      onSubmit={(e) => {
        const all = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "true";
        const msg = all ? `${verb} the ENTIRE order${free ? "" : ` (${formatMoney(remainingCents, currency)})`}?` : `${verb} ${picked.length} ticket(s)${free ? "" : ` for ${formatMoney(amount, currency)}`}?`;
        if (!window.confirm(`${msg} Refunded tickets can no longer be used for check-in.`)) e.preventDefault();
      }}>
      <input type="hidden" name="order_id" value={orderId} />
      {state.status !== "idle" && state.message && <Notice tone={state.status === "success" ? "success" : "error"}>{state.message}</Notice>}
      <fieldset>
        <legend className="text-sm font-medium">Choose tickets</legend>
        <ul className="mt-2 space-y-2">
          {tickets.map((t) => (
            <li key={t.id}>
              <label className="flex items-center gap-3 text-sm">
                <input type="checkbox" name="ticket_id" value={t.id} className="size-5 accent-pp-pink-strong"
                  checked={picked.includes(t.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, t.id] : p.filter((x) => x !== t.id)))} />
                <span>{t.label}{!free && <span className="text-pp-black/60"> · {formatMoney(t.share_cents, currency)}</span>}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" name="release_inventory" className="size-5 accent-pp-pink-strong" />
        Put these seats back on sale
      </label>
      <div>
        <label htmlFor={`reason-${orderId}`} className="text-sm font-medium">Reason (internal)</label>
        <input id={`reason-${orderId}`} name="reason" maxLength={200} className="mt-1 block w-full rounded-sm border border-pp-black/20 px-3 py-2 text-base" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Submit label={picked.length ? `${verb} selected${free ? "" : ` (${formatMoney(amount, currency)})`}` : `${verb} selected`} variant="primary" />
        <button type="submit" name="all" value="true" className={smallButton("danger")}>{verb} entire order</button>
      </div>
    </form>
  );
}
