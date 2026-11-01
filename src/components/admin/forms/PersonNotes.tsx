"use client";

import { useActionState } from "react";
import type { ActionState } from "@/server/admin/common";
import { savePersonNotes } from "@/server/admin/people";
import { Input, Result, Submit, TextArea } from "./Fields";

export function PersonNotes({ email, notes, tags }: { email: string; notes: string; tags: string[] }) {
  const [state, action] = useActionState<ActionState, FormData>(savePersonNotes, { status: "idle" });
  return (
    <form action={action} className="space-y-4">
      <Result state={state} />
      <input type="hidden" name="email" value={email} />
      <Input name="tags" label="Tags" state={state} defaultValue={tags.join(", ")} maxLength={600}
        hint="Separate with commas, e.g. vip, speaker, partner. Use tags to filter the People list." />
      <TextArea name="notes" label="Private notes" state={state} defaultValue={notes} rows={5}
        hint="Only staff with dashboard access can see these." />
      <Submit>Save notes</Submit>
    </form>
  );
}
