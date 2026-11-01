"use client";

import { useId, type ReactNode } from "react";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useFormStatus } from "react-dom";
import { cx } from "@/components/ui/primitives";
import type { ActionState } from "@/server/admin/common";
import { Notice, smallButton } from "../ui";

const input = (invalid: boolean) =>
  cx(
    "mt-1 block w-full rounded-sm border bg-white px-3 py-2.5 text-base text-pp-black outline-none focus:border-pp-pink-strong focus:ring-2 focus:ring-pp-pink-strong/30",
    invalid ? "border-[#b3261e]" : "border-pp-black/20",
  );

interface Base {
  name: string;
  label: string;
  state: ActionState;
  hint?: ReactNode;
  required?: boolean;
  defaultValue?: string | number | null;
  className?: string;
}

function useField(name: string, state: ActionState) {
  const id = `${useId()}-${name}`;
  const err = state.fieldErrors?.[name];
  return { id, err, describedBy: err ? `${id}-err` : undefined };
}

function Label({ id, label, required }: { id: string; label: string; required?: boolean }) {
  return <label htmlFor={id} className="text-sm font-medium">{label}{required && <span aria-hidden className="text-pp-pink-strong"> *</span>}</label>;
}

function Help({ id, hint, err }: { id: string; hint?: ReactNode; err?: string }) {
  return (
    <>
      {hint && <p className="mt-1 text-xs text-pp-black/60">{hint}</p>}
      {err && <p id={`${id}-err`} className="mt-1 text-sm text-[#b3261e]">{err}</p>}
    </>
  );
}

const val = (state: ActionState, name: string, d: Base["defaultValue"]) => state.values?.[name] ?? (d === null || d === undefined ? "" : String(d));

export function Input({ name, label, state, hint, required, defaultValue, className, type = "text", ...rest }: Base & {
  type?: string; inputMode?: "numeric" | "decimal" | "email"; placeholder?: string; autoComplete?: string; maxLength?: number;
}) {
  const f = useField(name, state);
  return (
    <div className={className}>
      <Label id={f.id} label={label} required={required} />
      {type === "password" ? (
        <PasswordInput tone="light" id={f.id} name={name} required={required} defaultValue={val(state, name, defaultValue)}
          aria-invalid={f.err ? true : undefined} aria-describedby={f.describedBy} className={input(Boolean(f.err))} {...rest} />
      ) : (
        <input id={f.id} name={name} type={type} required={required} defaultValue={val(state, name, defaultValue)}
          aria-invalid={f.err ? true : undefined} aria-describedby={f.describedBy} className={input(Boolean(f.err))} {...rest} />
      )}
      <Help id={f.id} hint={hint} err={f.err} />
    </div>
  );
}

export function TextArea({ name, label, state, hint, required, defaultValue, className, rows = 4 }: Base & { rows?: number }) {
  const f = useField(name, state);
  return (
    <div className={className}>
      <Label id={f.id} label={label} required={required} />
      <textarea id={f.id} name={name} rows={rows} required={required} defaultValue={val(state, name, defaultValue)}
        aria-invalid={f.err ? true : undefined} aria-describedby={f.describedBy} className={input(Boolean(f.err))} />
      <Help id={f.id} hint={hint} err={f.err} />
    </div>
  );
}

export function Select({ name, label, state, hint, required, defaultValue, className, options }: Base & { options: readonly { value: string; label: string }[] }) {
  const f = useField(name, state);
  return (
    <div className={className}>
      <Label id={f.id} label={label} required={required} />
      <select id={f.id} name={name} required={required} defaultValue={val(state, name, defaultValue)}
        aria-invalid={f.err ? true : undefined} aria-describedby={f.describedBy} className={input(Boolean(f.err))}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <Help id={f.id} hint={hint} err={f.err} />
    </div>
  );
}

export function Checkbox({ name, label, state, hint, defaultChecked }: Omit<Base, "defaultValue"> & { defaultChecked?: boolean }) {
  const id = `${useId()}-${name}`;
  const checked = state.values ? state.values[name] === "on" : Boolean(defaultChecked);
  return (
    <div className="flex items-start gap-3">
      <input id={id} name={name} type="checkbox" defaultChecked={checked} className="mt-1 size-5 accent-pp-pink-strong" />
      <div>
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        {hint && <p className="text-xs text-pp-black/60">{hint}</p>}
      </div>
    </div>
  );
}

export function Submit({ children, pendingLabel = "Saving…", variant = "primary" }: { children: ReactNode; pendingLabel?: string; variant?: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className={smallButton(variant, "min-w-32")}>{pending ? pendingLabel : children}</button>;
}

export function Result({ state }: { state: ActionState }) {
  if (state.status === "idle" || !state.message) return null;
  return <Notice tone={state.status === "success" ? "success" : "error"}>{state.message}</Notice>;
}

export function Fieldset({ legend, children, description }: { legend: string; children: ReactNode; description?: string }) {
  return (
    <fieldset className="space-y-4 rounded-sm border border-pp-black/10 bg-white p-4 sm:p-6">
      <legend className="px-1 text-base font-semibold">{legend}</legend>
      {description && <p className="-mt-2 text-sm text-pp-black/65">{description}</p>}
      {children}
    </fieldset>
  );
}
