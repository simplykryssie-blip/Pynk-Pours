"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { HONEYPOT_FIELD, STARTED_AT_FIELD } from "@/lib/validation";
import { buttonClass, cx } from "@/components/ui/primitives";
import type { FormState } from "@/server/actions/types";

type Tone = "light" | "dark";

const inputClass = (tone: Tone, invalid: boolean) =>
  cx(
    "mt-1.5 block w-full rounded-sm border px-3.5 py-3 text-base outline-none transition-colors",
    "focus:ring-2 focus:ring-pp-pink-strong/40",
    tone === "light"
      ? "border-pp-black/20 bg-white text-pp-black placeholder:text-pp-black/40 focus:border-pp-pink-strong"
      : "border-white/25 bg-white/5 text-pp-cream placeholder:text-pp-cream/40 focus:border-pp-pink",
    invalid && (tone === "light" ? "border-[#b3261e]" : "border-[#ff8a80]"),
  );

const errorClass = (tone: Tone) => cx("mt-1.5 text-sm", tone === "light" ? "text-[#b3261e]" : "text-[#ffb4ab]");

interface FieldProps {
  name: string;
  label: string;
  state: FormState;
  tone?: Tone;
  required?: boolean;
  hint?: string;
}

export function TextField({
  name, label, state, tone = "light", required, hint, type = "text", autoComplete, defaultValue, hideLabel,
}: FieldProps & { type?: string; autoComplete?: string; defaultValue?: string; hideLabel?: boolean }) {
  const id = `${useId()}-${name}`;
  const err = state.fieldErrors?.[name];
  const describedBy = [hint && `${id}-hint`, err && `${id}-err`].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className={cx("text-sm font-medium", hideLabel && "sr-only")}>
        {label}{required && <span aria-hidden> *</span>}
      </label>
      {hint && <p id={`${id}-hint`} className="mt-1 text-xs opacity-75">{hint}</p>}
      <input
        id={id} name={name} type={type} autoComplete={autoComplete} required={required}
        defaultValue={state.values?.[name] ?? defaultValue}
        aria-invalid={err ? true : undefined} aria-describedby={describedBy}
        className={inputClass(tone, Boolean(err))}
      />
      {err && <p id={`${id}-err`} className={errorClass(tone)}>{err}</p>}
    </div>
  );
}

export function TextArea({ name, label, state, tone = "light", required, rows = 6 }: FieldProps & { rows?: number }) {
  const id = `${useId()}-${name}`;
  const err = state.fieldErrors?.[name];
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">{label}{required && <span aria-hidden> *</span>}</label>
      <textarea
        id={id} name={name} rows={rows} required={required} maxLength={5000}
        defaultValue={state.values?.[name]}
        aria-invalid={err ? true : undefined} aria-describedby={err ? `${id}-err` : undefined}
        className={inputClass(tone, Boolean(err))}
      />
      {err && <p id={`${id}-err`} className={errorClass(tone)}>{err}</p>}
    </div>
  );
}

export function SelectField({
  name, label, state, tone = "light", required, options, defaultValue,
}: FieldProps & { options: { value: string; label: string }[]; defaultValue?: string }) {
  const id = `${useId()}-${name}`;
  const err = state.fieldErrors?.[name];
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">{label}{required && <span aria-hidden> *</span>}</label>
      <select
        id={id} name={name} required={required}
        defaultValue={state.values?.[name] ?? defaultValue}
        aria-invalid={err ? true : undefined} aria-describedby={err ? `${id}-err` : undefined}
        className={inputClass(tone, Boolean(err))}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {err && <p id={`${id}-err`} className={errorClass(tone)}>{err}</p>}
    </div>
  );
}

/** Honeypot + fill-time fields. Invisible to people and assistive tech. */
export function AntiSpamFields() {
  const hpId = `${useId()}-hp`;
  const [startedAt, setStartedAt] = useState("");
  useEffect(() => {
    // Set after hydration: bots that post the raw HTML never get a timestamp.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStartedAt(String(Date.now()));
  }, []);
  return (
    <>
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label htmlFor={hpId}>Leave this field empty</label>
        <input id={hpId} name={HONEYPOT_FIELD} type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>
      <input type="hidden" name={STARTED_AT_FIELD} value={startedAt} />
    </>
  );
}

export function SubmitButton({ children, pendingLabel = "Sending…", className, variant = "primary" }: {
  children: ReactNode; pendingLabel?: string; className?: string; variant?: "primary" | "dark";
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-disabled={pending} className={buttonClass(variant, className)}>
      {pending ? pendingLabel : children}
    </button>
  );
}

export function FormMessage({ state, tone = "light" }: { state: FormState; tone?: Tone }) {
  if (state.status === "idle" || !state.message) return <div role="status" aria-live="polite" />;
  const success = state.status === "success";
  return (
    <div
      role={success ? "status" : "alert"}
      aria-live="polite"
      className={cx(
        "rounded-sm border px-4 py-3 text-sm",
        success
          ? tone === "light" ? "border-[#1e6b3a]/30 bg-[#e8f5ec] text-[#14532d]" : "border-[#7ee2a8]/40 bg-[#7ee2a8]/10 text-[#c8f5d9]"
          : tone === "light" ? "border-[#b3261e]/30 bg-[#fdecea] text-[#8c1d18]" : "border-[#ffb4ab]/40 bg-[#ffb4ab]/10 text-[#ffdad6]",
      )}
    >
      {state.message}
    </div>
  );
}
