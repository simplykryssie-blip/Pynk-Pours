"use client";

import { useActionState } from "react";
import { subscribeNewsletter } from "@/server/actions/inbound";
import { initialFormState } from "@/server/actions/types";
import { AntiSpamFields, FormMessage, SubmitButton, TextField } from "./fields";

export function NewsletterForm({ source, tone = "light", stacked = false }: { source: string; tone?: "light" | "dark"; stacked?: boolean }) {
  const [state, action] = useActionState(subscribeNewsletter, initialFormState);
  if (state.status === "success") return <FormMessage state={state} tone={tone} />;
  return (
    <form action={action} noValidate className="relative w-full">
      <AntiSpamFields />
      <input type="hidden" name="source" value={source} />
      <div className={stacked ? "flex flex-col gap-3" : "flex flex-col gap-3 sm:flex-row sm:items-start"}>
        <div className="flex-1">
          <TextField name="email" label="Email address" type="email" autoComplete="email" required state={state} tone={tone} hideLabel />
        </div>
        <SubmitButton pendingLabel="Joining…" className={stacked ? "w-full" : "mt-1.5 sm:shrink-0"}>Join the PynkPours list</SubmitButton>
      </div>
      {state.status === "error" && !state.fieldErrors && <div className="mt-3"><FormMessage state={state} tone={tone} /></div>}
    </form>
  );
}
