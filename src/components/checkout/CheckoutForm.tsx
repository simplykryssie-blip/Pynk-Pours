"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { AntiSpamFields } from "@/components/forms/fields";
import { buttonClass, cx } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/money";
import { startCheckout, type CheckoutState } from "@/server/checkout/actions";

export interface CheckoutLine { ticket_type_id: string; name: string; unit_price_cents: number; quantity: number; admits_per_unit: number }
export interface CheckoutQuestion { id: string; label: string; help_text: string | null; kind: string; options: string[]; is_required: boolean }

const input = (invalid?: boolean) =>
  cx("mt-1 block w-full rounded-sm border bg-white px-3 py-2.5 text-base text-pp-black outline-none focus:border-pp-pink-strong focus:ring-2 focus:ring-pp-pink-strong/30",
    invalid ? "border-[#b3261e]" : "border-pp-black/20");

function Field({ name, label, type = "text", required, error, value, onChange, autoComplete, hint }: {
  name: string; label: string; type?: string; required?: boolean; error?: string; value?: string; onChange?: (v: string) => void; autoComplete?: string; hint?: string;
}) {
  const id = `${useId()}-${name}`;
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">{label}{required && <span aria-hidden className="text-pp-pink-strong"> *</span>}</label>
      <input id={id} name={name} type={type} required={required} autoComplete={autoComplete}
        value={value} onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-e` : undefined} className={input(Boolean(error))} />
      {hint && <p className="mt-1 text-xs text-pp-black/60">{hint}</p>}
      {error && <p id={`${id}-e`} className="mt-1 text-sm text-[#b3261e]">{error}</p>}
    </div>
  );
}

function Pay({ free, ready }: { free: boolean; ready: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || !ready} className={buttonClass("primary", "w-full")}>
      {pending ? "Reserving your tickets…" : free ? "Complete registration" : "Continue to secure payment"}
    </button>
  );
}

export function CheckoutForm({ slug, lines, questions, currency, minAge, holdMinutes }: {
  slug: string; lines: CheckoutLine[]; questions: CheckoutQuestion[]; currency: string; minAge: number | null; holdMinutes: number;
}) {
  const [state, action] = useActionState<CheckoutState, FormData>(startCheckout, { status: "idle" });
  const [key, setKey] = useState("");
  useEffect(() => {
    // One key per checkout attempt: a double-submit maps to the same order and Stripe session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setKey(crypto.randomUUID().replace(/-/g, ""));
  }, []);
  const [purchaser, setPurchaser] = useState({ name: "", email: "" });
  const seats = lines.flatMap((l) =>
    Array.from({ length: l.quantity * l.admits_per_unit }, (_, k) => ({
      tt: l.ticket_type_id,
      label: l.admits_per_unit > 1
        ? `${l.name} ${l.quantity > 1 ? `#${Math.floor(k / l.admits_per_unit) + 1} ` : ""}— guest ${(k % l.admits_per_unit) + 1} of ${l.admits_per_unit}`
        : `${l.name} — guest ${k + 1}`,
    })));
  const [guests, setGuests] = useState(() => seats.map(() => ({ name: "", email: "" })));
  const total = lines.reduce((a, l) => a + l.unit_price_cents * l.quantity, 0);
  const err = state.fieldErrors ?? {};
  const sel = JSON.stringify(lines.map((l) => ({ ticket_type_id: l.ticket_type_id, quantity: l.quantity })));

  return (
    <form action={action} noValidate className="relative grid gap-8 lg:grid-cols-[1.5fr_1fr]">
      <AntiSpamFields />
      <input type="hidden" name="event_slug" value={slug} />
      <input type="hidden" name="sel" value={sel} />
      <input type="hidden" name="idempotency_key" value={key} />
      <input type="hidden" name="age_required" value={minAge ? "true" : "false"} />
      <div className="space-y-6">
        {state.status === "error" && state.message && (
          <div role="alert" className="rounded-sm border border-[#b3261e]/30 bg-[#fdecea] px-4 py-3 text-sm text-[#8c1d18]">{state.message}{err.form ? ` ${err.form}` : ""}</div>
        )}
        <fieldset className="space-y-4 rounded-sm border border-pp-black/10 bg-white p-5">
          <legend className="px-1 font-semibold">Your details (purchaser)</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="purchaser_name" label="Full name" required autoComplete="name" error={err.purchaser_name}
              value={purchaser.name} onChange={(v) => setPurchaser((p) => ({ ...p, name: v }))} />
            <Field name="purchaser_email" label="Email" type="email" required autoComplete="email" error={err.purchaser_email}
              value={purchaser.email} onChange={(v) => setPurchaser((p) => ({ ...p, email: v }))} hint="Your confirmation is sent here." />
          </div>
          <Field name="purchaser_phone" label="Phone (optional)" type="tel" autoComplete="tel" error={err.purchaser_phone} />
        </fieldset>

        {seats.map((seat, i) => (
          <fieldset key={i} className="space-y-4 rounded-sm border border-pp-black/10 bg-white p-5" data-testid={`guest-${i}`}>
            <legend className="px-1 font-semibold">{seat.label}</legend>
            <input type="hidden" name={`att_${i}_tt`} value={seat.tt} />
            <button type="button" className="text-sm font-semibold text-pp-pink-strong underline"
              onClick={() => setGuests((g) => g.map((x, j) => (j === i ? { name: purchaser.name, email: purchaser.email } : x)))}>
              Use my details for this guest
            </button>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field name={`att_${i}_name`} label="Guest name" required error={err[`att_${i}_name`]}
                value={guests[i].name} onChange={(v) => setGuests((g) => g.map((x, j) => (j === i ? { ...x, name: v } : x)))} />
              <Field name={`att_${i}_email`} label="Guest email" type="email" required error={err[`att_${i}_email`]}
                value={guests[i].email} onChange={(v) => setGuests((g) => g.map((x, j) => (j === i ? { ...x, email: v } : x)))}
                hint="Their individual ticket will go to this address." />
            </div>
            {questions.map((q) => (
              <Question key={q.id} q={q} name={`att_${i}_q_${q.id}`} />
            ))}
          </fieldset>
        ))}
      </div>

      <aside className="h-fit space-y-4 rounded-sm border border-pp-black/10 bg-white p-5 lg:sticky lg:top-24" aria-label="Order summary">
        <h2 className="font-serif text-2xl">Order summary</h2>
        <ul className="space-y-2 text-sm">
          {lines.map((l) => (
            <li key={l.ticket_type_id} className="flex justify-between gap-3">
              <span>{l.quantity} × {l.name}{l.admits_per_unit > 1 ? ` (admits ${l.admits_per_unit})` : ""}</span>
              <span>{formatMoney(l.unit_price_cents * l.quantity, currency)}</span>
            </li>
          ))}
        </ul>
        <p className="flex justify-between border-t border-pp-black/10 pt-3 text-lg font-semibold"><span>Total</span><span data-testid="order-total">{formatMoney(total, currency)}</span></p>
        {minAge && (
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="age_confirm" className="mt-0.5 size-5 accent-pp-pink-strong" aria-invalid={err.age_confirm ? true : undefined} />
            <span>I confirm every guest is {minAge} or older and will bring valid ID.</span>
          </label>
        )}
        {err.age_confirm && <p className="text-sm text-[#b3261e]">{err.age_confirm}</p>}
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="agree" className="mt-0.5 size-5 accent-pp-pink-strong" aria-invalid={err.agree ? true : undefined} />
          <span>I&apos;ve read the event details and the <a href="/refunds" target="_blank" className="underline">refund policy</a>.</span>
        </label>
        {err.agree && <p className="text-sm text-[#b3261e]">{err.agree}</p>}
        <Pay free={total === 0} ready={Boolean(key)} />
        <p className="text-xs text-pp-black/60">
          {total === 0 ? "No payment needed." : `Your tickets are held for ${holdMinutes} minutes while you pay on Stripe's secure page. We never see or store your card details.`}
        </p>
      </aside>
    </form>
  );
}

function Question({ q, name }: { q: CheckoutQuestion; name: string }) {
  const id = `${useId()}-q`;
  const label = <label htmlFor={id} className="text-sm font-medium">{q.label}{q.is_required && <span className="text-pp-pink-strong"> *</span>}</label>;
  if (q.kind === "select") {
    return (
      <div>{label}
        <select id={id} name={name} required={q.is_required} className={input()} defaultValue="">
          <option value="" disabled>Choose…</option>
          {q.options.map((o) => <option key={o}>{o}</option>)}
        </select>
      </div>
    );
  }
  if (q.kind === "checkbox") {
    return <label className="flex items-center gap-3 text-sm"><input id={id} type="checkbox" name={name} value="Yes" className="size-5" />{q.label}</label>;
  }
  return <div>{label}<input id={id} name={name} required={q.is_required} className={input()} />{q.help_text && <p className="mt-1 text-xs text-pp-black/60">{q.help_text}</p>}</div>;
}
