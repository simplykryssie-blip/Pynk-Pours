"use client";

import { useActionState } from "react";
import { SUBMISSION_STATUSES } from "@/lib/forms";
import type { ActionState } from "@/server/admin/common";
import { createForm, saveSubmissionNotes, updateSubmissionStatus } from "@/server/admin/forms";
import { Checkbox, Input, Result, Select, Submit, TextArea } from "./Fields";

export function NewFormForm({ defaultTemplate }: { defaultTemplate: "blank" | "vendor" }) {
  const [state, action] = useActionState<ActionState, FormData>(createForm, { status: "idle" });
  return (
    <form action={action} className="space-y-5">
      <Result state={state} />
      <Input name="title" label="Form title" required state={state} maxLength={120} placeholder="e.g. Vendor Application: Spring Market" />
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Start from</legend>
        <label className="flex items-start gap-3">
          <input type="radio" name="template" value="vendor" defaultChecked={defaultTemplate === "vendor"} className="mt-1 size-5 accent-pp-pink-strong" />
          <span><strong>Vendor application</strong><br /><span className="text-sm text-pp-black/70">Business name, contact, category, description, photos, permits and agreement. Approved vendors go to Vendors.</span></span>
        </label>
        <label className="flex items-start gap-3">
          <input type="radio" name="template" value="blank" defaultChecked={defaultTemplate === "blank"} className="mt-1 size-5 accent-pp-pink-strong" />
          <span><strong>Blank form</strong><br /><span className="text-sm text-pp-black/70">Just name and email; add your own questions (speakers, volunteers, RSVPs…).</span></span>
        </label>
      </fieldset>
      <Submit pendingLabel="Creating…">Create form</Submit>
    </form>
  );
}

export function SubmissionStatusForm({ id, status }: { id: string; status: string }) {
  const [state, action] = useActionState<ActionState, FormData>(updateSubmissionStatus, { status: "idle" });
  return (
    <form action={action} className="space-y-4" key={state.nonce ?? "status"}>
      <Result state={state} />
      <input type="hidden" name="id" value={id} />
      <Select name="status" label="Status" state={state} defaultValue={status} options={SUBMISSION_STATUSES} />
      <TextArea name="message" label="Message to the applicant (optional)" state={state} rows={4}
        hint="Included in the email, e.g. your booth fee, set-up time or next steps." />
      <Checkbox name="notify" label="Email the applicant about this update" state={state} defaultChecked />
      <Submit>Update status</Submit>
    </form>
  );
}

export function SubmissionNotesForm({ id, notes }: { id: string; notes: string }) {
  const [state, action] = useActionState<ActionState, FormData>(saveSubmissionNotes, { status: "idle" });
  return (
    <form action={action} className="space-y-3">
      <Result state={state} />
      <input type="hidden" name="id" value={id} />
      <TextArea name="staff_notes" label="Private notes" state={state} defaultValue={notes} rows={4} hint="Only staff with dashboard access can see these." />
      <Submit>Save notes</Submit>
    </form>
  );
}
