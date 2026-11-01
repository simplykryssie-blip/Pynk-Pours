"use client";

import { useActionState, useId, useRef } from "react";
import type { ActionState } from "@/server/admin/common";
import { savePolicy } from "@/server/admin/pages";
import { smallButton } from "../ui";
import { Input, Result, Submit } from "./Fields";

/** Edit one policy page. Plain text: "## " starts a section, "- " starts a bullet. */
export function PolicyEditor({ slug, title, text, defaultText, viewHref }: {
  slug: string; title: string; text: string; defaultText: string; viewHref: string;
}) {
  const [state, action] = useActionState<ActionState, FormData>(savePolicy, { status: "idle" });
  const id = useId();
  const area = useRef<HTMLTextAreaElement>(null);
  const body = state.values?.body ?? text;
  const err = state.fieldErrors?.body;
  return (
    <form action={action} className="space-y-4">
      <Result state={state} />
      <input type="hidden" name="slug" value={slug} />
      <Input name="title" label="Page title" required state={state} defaultValue={title} maxLength={120} />
      <div>
        <label htmlFor={`${id}-body`} className="text-sm font-medium">Policy text <span aria-hidden="true">*</span></label>
        <p id={`${id}-help`} className="mt-1 text-xs text-pp-black/65">
          Leave a blank line between paragraphs. Start a line with <code>## </code> for a section heading
          (sections are numbered automatically) and <code>- </code> for a bullet point.
        </p>
        <textarea
          ref={area}
          key={state.nonce ?? "initial"}
          id={`${id}-body`}
          name="body"
          required
          rows={22}
          defaultValue={body}
          aria-invalid={err ? true : undefined}
          aria-describedby={`${id}-help${err ? ` ${id}-err` : ""}`}
          className="mt-2 block w-full rounded-sm border border-pp-black/20 bg-white px-3 py-2.5 font-mono text-sm leading-relaxed text-pp-black outline-none focus:border-pp-pink-strong focus:ring-2 focus:ring-pp-pink-strong/30"
        />
        {err && <p id={`${id}-err`} className="mt-1 text-sm text-[#b3261e]">{err}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Submit pendingLabel="Publishing…">Publish changes</Submit>
        <a href={viewHref} target="_blank" rel="noopener" className={smallButton("secondary")}>View on website ↗</a>
        <button
          type="button"
          className="text-sm text-pp-black/70 underline-offset-4 hover:underline"
          onClick={() => {
            if (area.current && window.confirm("Replace the text in the box with the original PynkPours draft? Nothing is published until you click Publish changes.")) {
              area.current.value = defaultText;
              area.current.focus();
            }
          }}
        >
          Restore original draft
        </button>
      </div>
    </form>
  );
}
