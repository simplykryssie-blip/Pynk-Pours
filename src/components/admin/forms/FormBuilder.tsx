"use client";

import { useActionState, useId, useState } from "react";
import { CHOICE_TYPES, FIELD_TYPES, fieldKey, VENDOR_MAPPINGS, type FieldType, type FormField, type VendorMapping } from "@/lib/forms";
import type { ActionState } from "@/server/admin/common";
import { saveForm } from "@/server/admin/forms";
import { smallButton } from "../ui";
import { Checkbox, Input, Result, Select, Submit, TextArea } from "./Fields";

export interface BuilderForm {
  id: string; title: string; slug: string; description: string; confirmation_message: string;
  status: "draft" | "open" | "closed"; event_id: string | null; closes_at: string | null; notify_staff: boolean;
  purpose: "general" | "vendor"; fields: FormField[];
}

const box = "mt-1 block w-full rounded-sm border border-pp-black/20 bg-white px-3 py-2.5 text-base text-pp-black outline-none focus:border-pp-pink-strong focus:ring-2 focus:ring-pp-pink-strong/30";

function QuestionEditor({ f, index, count, vendor, onChange, onMove, onRemove }: {
  f: FormField; index: number; count: number; vendor: boolean;
  onChange: (f: FormField) => void; onMove: (dir: -1 | 1) => void; onRemove: () => void;
}) {
  const id = useId();
  const choice = CHOICE_TYPES.includes(f.type);
  return (
    <li className="rounded-sm border border-pp-black/15 bg-white p-4" data-testid="question">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Question {index + 1}</p>
        <div className="flex gap-1">
          <button type="button" className={smallButton("secondary", "px-2")} disabled={index === 0} onClick={() => onMove(-1)} aria-label={`Move question ${index + 1} up`}>↑</button>
          <button type="button" className={smallButton("secondary", "px-2")} disabled={index === count - 1} onClick={() => onMove(1)} aria-label={`Move question ${index + 1} down`}>↓</button>
          <button type="button" className={smallButton("danger", "px-2")} onClick={onRemove} aria-label={`Delete question ${index + 1}`}>Delete</button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
        <div>
          <label htmlFor={`${id}-label`} className="text-sm font-medium">Question</label>
          <input id={`${id}-label`} className={box} value={f.label} maxLength={200} onChange={(e) => onChange({ ...f, label: e.target.value })} />
        </div>
        <div>
          <label htmlFor={`${id}-type`} className="text-sm font-medium">Answer type</label>
          <select id={`${id}-type`} className={box} value={f.type} onChange={(e) => onChange({ ...f, type: e.target.value as FieldType })}>
            {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-3">
        <label htmlFor={`${id}-help`} className="text-sm font-medium">Help text (optional)</label>
        <input id={`${id}-help`} className={box} value={f.help ?? ""} maxLength={500} onChange={(e) => onChange({ ...f, help: e.target.value })} />
      </div>
      {choice && (
        <div className="mt-3">
          <label htmlFor={`${id}-opts`} className="text-sm font-medium">Choices (one per line)</label>
          <textarea id={`${id}-opts`} rows={4} className={box} value={(f.options ?? []).join("\n")}
            onChange={(e) => onChange({ ...f, options: e.target.value.split("\n").map((s) => s.slice(0, 120)) })} />
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-5 accent-pp-pink-strong" checked={Boolean(f.required)} onChange={(e) => onChange({ ...f, required: e.target.checked })} />
          Required
        </label>
        {vendor && f.type !== "email" && f.type !== "file" && (
          <label className="flex items-center gap-2 text-sm">
            Fills vendor detail
            <select className="rounded-sm border border-pp-black/20 bg-white px-2 py-1.5" value={f.vendor ?? ""}
              onChange={(e) => onChange({ ...f, vendor: (e.target.value || undefined) as VendorMapping | undefined })}>
              {VENDOR_MAPPINGS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
        )}
      </div>
    </li>
  );
}

/** Edit a form's settings and questions. Questions are saved together with the settings. */
export function FormBuilder({ form, events, siteUrl }: { form: BuilderForm; events: { id: string; title: string }[]; siteUrl: string }) {
  const [state, action] = useActionState<ActionState, FormData>(saveForm, { status: "idle" });
  const [fields, setFields] = useState<FormField[]>(form.fields);
  const update = (i: number, f: FormField) => setFields((all) => all.map((x, j) => (j === i ? f : x)));
  const move = (i: number, dir: -1 | 1) => setFields((all) => {
    const next = [...all];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    return next;
  });
  const add = () => setFields((all) => [...all, { key: fieldKey(`question ${all.length + 1}`, new Set(all.map((f) => f.key))), type: "short_text", label: "", required: false }]);
  // Clean up before saving: trim choices, drop empty ones, give new questions readable keys.
  const serialized = JSON.stringify(fields.map((f) => ({ ...f, options: CHOICE_TYPES.includes(f.type) ? (f.options ?? []).map((o) => o.trim()).filter(Boolean) : [] })));
  const closes = form.closes_at ? new Date(form.closes_at).toLocaleDateString("en-CA", { timeZone: "America/Chicago" }) : "";

  return (
    <form action={action} className="space-y-6">
      <Result state={state} />
      <input type="hidden" name="id" value={form.id} />
      <input type="hidden" name="fields" value={serialized} />
      <section aria-labelledby="fb-settings" className="space-y-4 rounded-sm border border-pp-black/10 bg-white p-4 sm:p-6">
        <h2 id="fb-settings" className="font-serif text-2xl">Settings</h2>
        <Input name="title" label="Form title" required state={state} defaultValue={form.title} maxLength={120} />
        <Input name="slug" label="Web address" required state={state} defaultValue={form.slug} maxLength={60}
          hint={`The form is at ${siteUrl}/forms/${form.slug}. Changing it breaks links you've already shared.`} />
        <div className="grid gap-4 sm:grid-cols-3">
          <Select name="status" label="Status" state={state} defaultValue={form.status} options={[
            { value: "draft", label: "Draft (hidden)" }, { value: "open", label: "Open (accepting responses)" }, { value: "closed", label: "Closed" },
          ]} />
          <Select name="event_id" label="Linked event (optional)" state={state} defaultValue={form.event_id ?? ""}
            options={[{ value: "", label: "None" }, ...events.map((e) => ({ value: e.id, label: e.title }))]} />
          <Input name="closes_at" type="date" label="Close automatically after (optional)" state={state} defaultValue={closes} />
        </div>
        <TextArea name="description" label="Introduction (shown above the questions)" state={state} defaultValue={form.description} rows={4} />
        <TextArea name="confirmation_message" label="Thank-you message (optional)" state={state} defaultValue={form.confirmation_message} rows={3}
          hint="Shown after someone submits and included in their confirmation email, e.g. next steps or when you'll reply." />
        <Checkbox name="notify_staff" label="Email the PynkPours inbox for each new response" state={state} defaultChecked={form.notify_staff} />
      </section>

      <section aria-labelledby="fb-questions" className="space-y-4">
        <h2 id="fb-questions" className="font-serif text-2xl">Questions</h2>
        <p className="text-sm text-pp-black/70">The first Email question is where confirmations and status updates are sent, so it must be required.</p>
        <ol className="space-y-4">
          {fields.map((f, i) => (
            <QuestionEditor key={f.key} f={f} index={i} count={fields.length} vendor={form.purpose === "vendor"}
              onChange={(nf) => update(i, nf)} onMove={(d) => move(i, d)} onRemove={() => setFields((all) => all.filter((_, j) => j !== i))} />
          ))}
        </ol>
        <button type="button" onClick={add} className={smallButton("secondary")} disabled={fields.length >= 40}>+ Add question</button>
      </section>
      <div className="sticky bottom-0 -mx-4 border-t border-pp-black/10 bg-pp-cream/95 px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <Submit>Save form</Submit>
      </div>
    </form>
  );
}
