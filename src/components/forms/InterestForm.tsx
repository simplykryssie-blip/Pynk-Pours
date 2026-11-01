"use client";

import { useActionState } from "react";
import { registerInterest } from "@/server/actions/inbound";
import { initialFormState } from "@/server/actions/types";
import { AntiSpamFields, FormMessage, SubmitButton, TextField } from "./fields";

export function InterestForm({ eventSlug, kind, cta }: { eventSlug: string; kind: "notify" | "waitlist"; cta: string }) {
  const [state, action] = useActionState(registerInterest, initialFormState);
  if (state.status === "success") return <FormMessage state={state} tone="dark" />;
  return (
    <form action={action} noValidate className="relative grid gap-4">
      <AntiSpamFields />
      <input type="hidden" name="eventSlug" value={eventSlug} />
      <input type="hidden" name="kind" value={kind} />
      <FormMessage state={state} tone="dark" />
      <TextField name="name" label="Name (optional)" autoComplete="name" state={state} tone="dark" />
      <TextField name="email" label="Email address" type="email" autoComplete="email" required state={state} tone="dark" />
      <SubmitButton pendingLabel="Saving…" className="w-full">{cta}</SubmitButton>
    </form>
  );
}
