"use client";

import { useActionState, useRef, useState } from "react";
import type { ActionState } from "@/server/admin/common";
import { saveCustomPage } from "@/server/admin/pages";
import { Checkbox, Input, Result, Submit, TextArea } from "./Fields";

export interface CustomPageValues {
  id?: string;
  title: string;
  slug: string;
  body: string;
  published: boolean;
  show_in_footer: boolean;
  footer_position: number;
}

const toSlug = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");

/** Create or edit a custom page. Same plain-text format as the built-in policies. */
export function CustomPageEditor({ page, siteUrl }: { page: CustomPageValues; siteUrl: string }) {
  const [state, action] = useActionState<ActionState, FormData>(saveCustomPage, { status: "idle" });
  const isNew = !page.id;
  const slugRef = useRef<HTMLDivElement>(null);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [slug, setSlug] = useState(state.values?.slug ?? page.slug);

  return (
    <form action={action} className="space-y-5" key={state.nonce ?? "initial"}>
      <Result state={state} />
      {page.id && <input type="hidden" name="id" value={page.id} />}
      <div onInput={(e) => {
        const t = e.target as HTMLInputElement;
        if (t.name === "title" && !slugTouched) {
          const s = toSlug(t.value);
          setSlug(s);
          const el = slugRef.current?.querySelector<HTMLInputElement>("input[name=slug]");
          if (el) el.value = s;
        }
      }}>
        <Input name="title" label="Page title" required state={state} defaultValue={page.title} maxLength={120} placeholder="e.g. Code of Conduct" />
      </div>
      <div ref={slugRef} onInput={(e) => { setSlugTouched(true); setSlug((e.target as HTMLInputElement).value); }}>
        <Input name="slug" label="Web address" required state={state} defaultValue={page.slug} maxLength={60}
          placeholder="code-of-conduct"
          hint={`The page will be at ${siteUrl}/policies/${slug || "…"}. Lowercase letters, numbers and dashes. Changing it later breaks old links.`} />
      </div>
      <TextArea name="body" label="Page text" required state={state} defaultValue={page.body} rows={20}
        hint="Leave a blank line between paragraphs. Start a line with “## ” for a numbered section heading and “- ” for a bullet point." />
      <fieldset className="space-y-3 rounded-sm border border-pp-black/10 p-4">
        <legend className="px-1 text-sm font-semibold">On the website</legend>
        <Checkbox name="published" label="Published (visible on the website)" state={state} defaultChecked={page.published}
          hint="Untick to hide the page. Hidden pages are kept here and can be published again any time." />
        <Checkbox name="show_in_footer" label="Show a link in the site footer" state={state} defaultChecked={page.show_in_footer}
          hint="Only appears while the page is published." />
        <Input name="footer_position" label="Footer order" type="number" inputMode="numeric" state={state} defaultValue={page.footer_position}
          hint="Lower numbers appear first. Pages with the same number are sorted by title." className="max-w-40" />
      </fieldset>
      <Submit pendingLabel="Saving…">{isNew ? "Create page" : "Save changes"}</Submit>
    </form>
  );
}
