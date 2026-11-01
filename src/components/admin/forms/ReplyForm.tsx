"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/server/admin/common";
import { replyToMessage } from "@/server/admin/people";
import { smallButton } from "../ui";
import { Result, Submit, TextArea } from "./Fields";

/** Inline reply to a contact-form message; sent by email from the PynkPours address. */
export function ReplyForm({ id, name, email }: { id: string; name: string; email: string }) {
  const [state, action] = useActionState<ActionState, FormData>(replyToMessage, { status: "idle" });
  // Open while no new reply has been sent since the box was opened (a successful send closes it).
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt !== null && openedAt === (state.nonce ?? "");
  if (!open) {
    return (
      <div className="space-y-2">
        {state.status === "success" && <Result state={state} />}
        <button type="button" onClick={() => setOpenedAt(state.nonce ?? "")} className={smallButton("primary")}>Reply</button>
      </div>
    );
  }
  return (
    <form action={action} className="w-full space-y-3">
      <Result state={state} />
      <input type="hidden" name="id" value={id} />
      <TextArea name="body" label={`Reply to ${name}`} required state={state} rows={6}
        hint={`Emailed to ${email} from the PynkPours address. Their answer comes back to your PynkPours inbox.`} />
      <div className="flex flex-wrap gap-2">
        <Submit pendingLabel="Sending…">Send reply</Submit>
        <button type="button" onClick={() => setOpenedAt(null)} className={smallButton("secondary")}>Cancel</button>
      </div>
    </form>
  );
}
