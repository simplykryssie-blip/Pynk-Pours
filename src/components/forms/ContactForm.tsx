"use client";

import { useActionState } from "react";
import { submitContact } from "@/server/actions/inbound";
import { initialFormState } from "@/server/actions/types";
import { AntiSpamFields, FormMessage, SelectField, SubmitButton, TextArea, TextField } from "./fields";

const TOPICS = [
  { value: "general", label: "General question" },
  { value: "event", label: "Event inquiry" },
  { value: "partnership", label: "Partnership / sponsorship" },
  { value: "press", label: "Press / media" },
];

export function ContactForm({ defaultTopic = "general", submitLabel = "Send message" }: { defaultTopic?: string; submitLabel?: string }) {
  const [state, action] = useActionState(submitContact, initialFormState);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} noValidate className="relative grid gap-5">
      <AntiSpamFields />
      <FormMessage state={state} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField name="name" label="Full name" autoComplete="name" required state={state} />
        <TextField name="email" label="Email address" type="email" autoComplete="email" required state={state} />
      </div>
      <SelectField name="topic" label="Topic" required options={TOPICS} defaultValue={defaultTopic} state={state} />
      <TextField name="subject" label="Subject (optional)" state={state} />
      <TextArea name="message" label="Your message" required state={state} />
      <p className="text-xs text-pp-black/70">Fields marked * are required. We only use your details to respond to your message.</p>
      <div><SubmitButton>{submitLabel}</SubmitButton></div>
    </form>
  );
}
