"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/server/admin/common";
import { Notice, smallButton } from "../ui";

function Btn({ label, variant, pendingLabel }: { label: string; variant: "primary" | "secondary" | "danger"; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className={smallButton(variant)}>{pending ? pendingLabel ?? "Working…" : label}</button>;
}

/** A one-click server operation (publish, archive, delete…) with optional confirmation and inline result. */
export function OpButton({ action, fields, label, variant = "secondary", confirm, pendingLabel, showResult = true }: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  label: string;
  variant?: "primary" | "secondary" | "danger";
  confirm?: string;
  pendingLabel?: string;
  showResult?: boolean;
}) {
  const [state, formAction] = useActionState(action, { status: "idle" });
  return (
    <div className="inline-flex flex-col gap-2">
      <form
        action={formAction}
        onSubmit={(e) => {
          if (confirm && !window.confirm(confirm)) e.preventDefault();
        }}
      >
        {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <Btn label={label} variant={variant} pendingLabel={pendingLabel} />
      </form>
      {showResult && state.status !== "idle" && state.message && (
        <Notice tone={state.status === "success" ? "success" : "error"}>{state.message}</Notice>
      )}
    </div>
  );
}
