"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass } from "@/components/ui/primitives";
import { cancelPendingOrder, resumePayment, type CheckoutState } from "@/server/checkout/actions";

function Btn({ children, variant }: { children: React.ReactNode; variant: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className={buttonClass(variant, "w-full sm:w-auto")}>{pending ? "Please wait…" : children}</button>;
}

export function PendingOrderActions({ token }: { token: string }) {
  const [state, cancel] = useActionState<CheckoutState, FormData>(cancelPendingOrder, { status: "idle" });
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <form action={resumePayment}><input type="hidden" name="token" value={token} /><Btn variant="primary">Return to payment</Btn></form>
        <form action={cancel} onSubmit={(e) => { if (!window.confirm("Cancel this order and release the tickets?")) e.preventDefault(); }}>
          <input type="hidden" name="token" value={token} /><Btn variant="secondary">Cancel order</Btn>
        </form>
      </div>
      {state.status === "error" && <p role="alert" className="text-sm text-[#ffb4ab]">{state.message}</p>}
    </div>
  );
}
