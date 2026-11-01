"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { manualCheckIn } from "@/server/admin/people";
import { Notice, smallButton } from "../ui";

function Btn() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} className={smallButton("primary", "min-h-12 px-6 text-base")}>{pending ? "Checking in…" : "Check in"}</button>;
}

/** Stays mounted after success so staff always see the outcome. */
export function CheckInButton({ eventId, ticketId, checkedIn }: { eventId: string; ticketId: string; checkedIn: boolean }) {
  const [state, action] = useActionState(manualCheckIn, { status: "idle" });
  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      {!checkedIn && state.status !== "success" && (
        <form action={action}>
          <input type="hidden" name="event_id" value={eventId} />
          <input type="hidden" name="ticket_id" value={ticketId} />
          <Btn />
        </form>
      )}
      {state.status !== "idle" && state.message && <Notice tone={state.status === "success" ? "success" : "error"}>{state.message}</Notice>}
    </div>
  );
}
