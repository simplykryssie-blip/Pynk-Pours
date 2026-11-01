"use client";

import { useId, useState } from "react";
import { smallButton } from "../ui";

export interface ListField { key: string; label: string; multiline?: boolean; required?: boolean; placeholder?: string }

/**
 * Repeatable rows (agenda items, FAQs, speakers) serialised into one hidden JSON
 * field. Validation happens on the server.
 */
export function ListEditor({ name, label, fields, initial, addLabel, error }: {
  name: string; label: string; fields: ListField[]; initial: Record<string, string>[]; addLabel: string; error?: string;
}) {
  const uid = useId();
  const [rows, setRows] = useState<Record<string, string>[]>(initial);
  const clean = rows
    .map((r) => Object.fromEntries(fields.map((f) => [f.key, (r[f.key] ?? "").trim()]).filter(([, v]) => v !== "")))
    .filter((r) => Object.keys(r).length > 0);
  const update = (i: number, key: string, value: string) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  const move = (i: number, d: -1 | 1) =>
    setRows((rs) => {
      const next = [...rs];
      const j = i + d;
      if (j < 0 || j >= next.length) return rs;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <input type="hidden" name={name} value={JSON.stringify(clean)} />
      <ol className="mt-2 space-y-3">
        {rows.map((row, i) => (
          <li key={i} className="rounded-sm border border-pp-black/10 bg-[#faf7f5] p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((f) => {
                const id = `${uid}-${i}-${f.key}`;
                const common = {
                  id, value: row[f.key] ?? "", placeholder: f.placeholder,
                  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update(i, f.key, e.target.value),
                  className: "mt-1 block w-full rounded-sm border border-pp-black/20 bg-white px-3 py-2 text-base",
                };
                return (
                  <div key={f.key} className={f.multiline ? "sm:col-span-2" : undefined}>
                    <label htmlFor={id} className="text-xs font-medium text-pp-black/70">{f.label}{f.required && " *"}</label>
                    {f.multiline ? <textarea rows={2} {...common} /> : <input {...common} />}
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex gap-2">
              <button type="button" className={smallButton("secondary")} onClick={() => move(i, -1)} aria-label={`Move item ${i + 1} up`}>↑</button>
              <button type="button" className={smallButton("secondary")} onClick={() => move(i, 1)} aria-label={`Move item ${i + 1} down`}>↓</button>
              <button type="button" className={smallButton("danger")} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>Remove</button>
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className={smallButton("secondary", "mt-3")} onClick={() => setRows((rs) => [...rs, {}])}>+ {addLabel}</button>
      {error && <p className="mt-1 text-sm text-[#b3261e]">{error}</p>}
    </div>
  );
}
