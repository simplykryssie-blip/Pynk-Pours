"use client";

import { useActionState } from "react";
import { changePassword, type AuthState } from "@/server/auth/actions";
import { createStaffMember, staffOperation, updateAttendee } from "@/server/admin/people";
import { mediaOperation } from "@/server/admin/media";
import { Notice, smallButton } from "../ui";
import { Input, Result, Select, Submit } from "./Fields";

export function AttendeeEditForm({ attendee }: { attendee: { id: string; full_name: string; email: string; phone: string | null } }) {
  const [state, action] = useActionState(updateAttendee, { status: "idle" });
  return (
    <form action={action} noValidate className="grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="attendee_id" value={attendee.id} />
      <div className="sm:col-span-3"><Result state={state} /></div>
      <Input name="full_name" label="Name" state={state} defaultValue={attendee.full_name} />
      <Input name="email" label="Email" type="email" state={state} defaultValue={attendee.email} />
      <Input name="phone" label="Phone" state={state} defaultValue={attendee.phone} />
      <div><Submit>Save attendee</Submit></div>
    </form>
  );
}

export function MediaAltForm({ eventId, mediaId, alt }: { eventId: string; mediaId: string; alt: string | null }) {
  const [state, action] = useActionState(mediaOperation, { status: "idle" });
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="id" value={mediaId} />
      <input type="hidden" name="op" value="alt" />
      <Input name="alt_text" label="Description" state={state} defaultValue={alt} />
      <button type="submit" className={smallButton("secondary")}>Save description</button>
      <Result state={state} />
    </form>
  );
}

const ROLE_OPTIONS = [
  { value: "checkin", label: "Check-in staff — check guests in only (no financial data)" },
  { value: "admin", label: "Admin — events, registrations, sales" },
  { value: "owner", label: "Owner — everything, including staff" },
];

export function CreateStaffForm() {
  const [state, action] = useActionState(createStaffMember, { status: "idle" });
  return (
    <form action={action} noValidate className="space-y-4" key={state.status === "success" ? state.secret : "f"}>
      {state.status === "success" ? (
        <Notice tone="success">
          <p>{state.message}</p>
          <p className="mt-2">Temporary password: <code className="rounded bg-white px-2 py-1 font-mono text-base select-all" data-testid="temp-password">{state.secret}</code></p>
        </Notice>
      ) : <Result state={state} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Input name="display_name" label="Name" required state={state} />
        <Input name="email" label="Email" type="email" required state={state} autoComplete="off" />
      </div>
      <Select name="role" label="Role" state={state} defaultValue="checkin" options={ROLE_OPTIONS} />
      <Submit pendingLabel="Creating…">Add staff member</Submit>
    </form>
  );
}

export function StaffRoleForm({ userId, role }: { userId: string; role: string }) {
  const [state, action] = useActionState(staffOperation, { status: "idle" });
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="op" value="role" />
      <Select name="role" label="Role" state={state} defaultValue={role} options={ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label.split(" — ")[0] }))} />
      <button type="submit" className={smallButton("secondary")}>Change role</button>
      <div className="w-full"><Result state={state} /></div>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action] = useActionState<AuthState, FormData>(changePassword, { status: "idle" });
  const asAdmin = { status: state.status === "success" ? "success" : state.status === "error" ? "error" : "idle", message: state.message } as const;
  return (
    <form action={action} className="max-w-md space-y-4">
      <Result state={asAdmin} />
      <Input name="password" label="New password" type="password" autoComplete="new-password" state={asAdmin} hint="At least 12 characters with upper- and lowercase letters and a number." />
      <Input name="confirm" label="Confirm new password" type="password" autoComplete="new-password" state={asAdmin} />
      <Submit>Update password</Submit>
    </form>
  );
}
