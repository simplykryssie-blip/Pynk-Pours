"use client";

import { createClient } from "@supabase/supabase-js";
import { useActionState, useId, useState } from "react";
import { cx } from "@/components/ui/primitives";
import { FILE_TYPES, MAX_FILE_BYTES, MAX_FILES_PER_FIELD, type FormField, type UploadedFile } from "@/lib/forms";
import { requestUpload, submitForm, type PublicFormState } from "@/server/actions/forms";
import { AntiSpamFields, SubmitButton } from "./fields";

const FORM_BUCKET = "form-uploads";

const inputClass = (invalid: boolean) => cx(
  "mt-1.5 block w-full rounded-sm border bg-white px-3.5 py-3 text-base text-pp-black outline-none transition-colors",
  "border-pp-black/20 placeholder:text-pp-black/40 focus:border-pp-pink-strong focus:ring-2 focus:ring-pp-pink-strong/40",
  invalid && "border-[#b3261e]",
);

function Question({ f, state, uploads, setUploads, slug }: {
  f: FormField; state: PublicFormState; slug: string;
  uploads: Record<string, UploadedFile[]>; setUploads: (key: string, list: UploadedFile[]) => void;
}) {
  const id = `${useId()}-${f.key}`;
  const err = state.fieldErrors?.[f.key];
  const prior = state.values?.[f.key];
  const one = Array.isArray(prior) ? prior[0] : prior;
  const many = Array.isArray(prior) ? prior : prior ? [prior] : [];
  const describedBy = [f.help && `${id}-help`, err && `${id}-err`].filter(Boolean).join(" ") || undefined;
  const label = <>{f.label}{f.required && <span aria-hidden> *</span>}</>;
  const help = f.help ? <p id={`${id}-help`} className="mt-1 text-xs text-pp-black/70">{f.help}</p> : null;
  const error = err ? <p id={`${id}-err`} className="mt-1.5 text-sm text-[#b3261e]">{err}</p> : null;
  const common = { "aria-invalid": err ? true : undefined, "aria-describedby": describedBy } as const;
  const [busy, setBusy] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  if (f.type === "radio" || f.type === "checkboxes") {
    return (
      <fieldset aria-describedby={describedBy}>
        <legend className="text-sm font-medium">{label}</legend>
        {help}
        <div className="mt-2 space-y-2">
          {f.options?.map((o) => (
            <label key={o} className="flex items-start gap-3 text-base">
              <input type={f.type === "radio" ? "radio" : "checkbox"} name={f.key} value={o}
                defaultChecked={f.type === "radio" ? one === o : many.includes(o)}
                required={f.type === "radio" && f.required} className="mt-1 size-5 accent-pp-pink-strong" />
              <span>{o}</span>
            </label>
          ))}
        </div>
        {error}
      </fieldset>
    );
  }
  if (f.type === "yes") {
    return (
      <div>
        <label className="flex items-start gap-3 text-base">
          <input type="checkbox" name={f.key} defaultChecked={one === "on"} required={f.required} className="mt-1 size-5 accent-pp-pink-strong" {...common} />
          <span>{label}</span>
        </label>
        {help}{error}
      </div>
    );
  }
  if (f.type === "file") {
    const list = uploads[f.key] ?? [];
    const onPick = async (files: FileList | null) => {
      if (!files?.length) return;
      setUploadErr(null);
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
      const storage = createClient(url, key, { auth: { persistSession: false } }).storage.from(FORM_BUCKET);
      const next = [...list];
      setBusy(true);
      try {
        for (const file of Array.from(files)) {
          if (next.length >= MAX_FILES_PER_FIELD) { setUploadErr(`Upload up to ${MAX_FILES_PER_FIELD} files.`); break; }
          if (!FILE_TYPES[file.type]) { setUploadErr(`${file.name}: please use a PDF or a photo (JPEG, PNG, WebP or HEIC).`); continue; }
          if (file.size > MAX_FILE_BYTES) { setUploadErr(`${file.name} is over 10 MB.`); continue; }
          const r = await requestUpload({ slug, field: f.key, filename: file.name, size: file.size, type: file.type });
          if (!r.ok) { setUploadErr(r.message); break; }
          const { error: upErr } = await storage.uploadToSignedUrl(r.path, r.token, file, { contentType: file.type });
          if (upErr) { setUploadErr(`${file.name} didn't upload. Please try again.`); continue; }
          next.push({ path: r.path, filename: file.name, contentType: file.type, size: file.size });
          setUploads(f.key, [...next]);
        }
      } finally {
        setBusy(false);
      }
    };
    return (
      <div>
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        {help}
        <input id={id} type="file" multiple accept={Object.keys(FILE_TYPES).join(",")} disabled={busy}
          onChange={(e) => { void onPick(e.target.files); e.target.value = ""; }}
          className="mt-2 block w-full text-sm file:mr-3 file:rounded-sm file:border-0 file:bg-pp-black file:px-4 file:py-2.5 file:text-pp-cream" {...common} />
        {busy && <p role="status" className="mt-2 text-sm">Uploading…</p>}
        {list.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm" aria-label={`Uploaded for ${f.label}`}>
            {list.map((u, i) => (
              <li key={u.path} className="flex items-center justify-between gap-3 rounded-sm bg-pp-black/5 px-3 py-2">
                <span className="truncate">✓ {u.filename}</span>
                <button type="button" className="underline" onClick={() => setUploads(f.key, list.filter((_, j) => j !== i))} aria-label={`Remove ${u.filename}`}>Remove</button>
                <input type="hidden" name={f.key} value={JSON.stringify(u)} />
              </li>
            ))}
          </ul>
        )}
        {uploadErr && <p role="alert" className="mt-1.5 text-sm text-[#b3261e]">{uploadErr}</p>}
        {error}
      </div>
    );
  }
  const type = { email: "email", phone: "tel", url: "url", number: "number", date: "date" }[f.type as string] ?? "text";
  const auto = { email: "email", phone: "tel", url: "url" }[f.type as string];
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {help}
      {f.type === "long_text" ? (
        <textarea id={id} name={f.key} rows={5} maxLength={5000} required={f.required} defaultValue={one} className={inputClass(Boolean(err))} {...common} />
      ) : f.type === "select" ? (
        <select id={id} name={f.key} required={f.required} defaultValue={one ?? ""} className={inputClass(Boolean(err))} {...common}>
          <option value="">Choose…</option>
          {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input id={id} name={f.key} type={type} autoComplete={auto} maxLength={500} required={f.required} defaultValue={one}
          inputMode={f.type === "number" ? "decimal" : undefined} className={inputClass(Boolean(err))} {...common} />
      )}
      {error}
    </div>
  );
}

export function PublicForm({ slug, fields }: { slug: string; fields: FormField[] }) {
  const [state, action] = useActionState<PublicFormState, FormData>(submitForm, { status: "idle" });
  const [uploads, setAll] = useState<Record<string, UploadedFile[]>>({});
  const setUploads = (key: string, list: UploadedFile[]) => setAll((u) => ({ ...u, [key]: list }));
  return (
    <form action={action} noValidate className="relative grid gap-6">
      <AntiSpamFields />
      <input type="hidden" name="form_slug" value={slug} />
      {state.status === "error" && state.message && (
        <div role="alert" className="rounded-sm border border-[#b3261e]/40 bg-[#fdecea] px-4 py-3 text-sm text-[#8c1d18]">{state.message}</div>
      )}
      {fields.map((f) => <Question key={f.key} f={f} state={state} slug={slug} uploads={uploads} setUploads={setUploads} />)}
      <p className="text-xs text-pp-black/70">Questions marked * are required. You&apos;ll get an email with a private link to check your status.</p>
      <div><SubmitButton pendingLabel="Sending…">Submit</SubmitButton></div>
    </form>
  );
}
