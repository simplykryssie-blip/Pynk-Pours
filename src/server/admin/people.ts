"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { staffForAction, type StaffRole } from "../auth/staff";
import { serviceDb } from "../supabase";
import { dbMessage, invalid, isUuid, type ActionState } from "./common";

// ---------------------------------------------------------------- attendees
const attendeeSchema = z.object({
  full_name: z.string().trim().min(1, "Enter a name.").max(160),
  email: z.string().trim().toLowerCase().pipe(z.email({ error: "Enter a valid email address." })),
  phone: z.string().trim().max(40),
});

export async function updateAttendee(_prev: ActionState, form: FormData): Promise<ActionState> {
  const staff = await staffForAction(["owner", "admin"]);
  if ("error" in staff) return { status: "error", message: staff.error };
  const id = form.get("attendee_id");
  if (!isUuid(id)) return { status: "error", message: "Invalid request." };
  const parsed = attendeeSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return invalid(parsed.error, form);
  const { error } = await staff.db.rpc("admin_update_attendee", {
    p_attendee_id: id, p_full_name: parsed.data.full_name, p_email: parsed.data.email, p_phone: parsed.data.phone,
  });
  if (error) return { status: "error", message: dbMessage(error) };
  revalidatePath("/admin", "layout");
  return { status: "success", message: "Attendee updated." };
}

// ---------------------------------------------------------------- check-in (manual)
export async function manualCheckIn(_prev: ActionState, form: FormData): Promise<ActionState> {
  const staff = await staffForAction(["owner", "admin", "checkin"]);
  if ("error" in staff) return { status: "error", message: staff.error };
  const eventId = form.get("event_id");
  const ticketId = form.get("ticket_id");
  if (!isUuid(eventId) || !isUuid(ticketId)) return { status: "error", message: "Invalid request." };
  const { data, error } = await staff.db.rpc("check_in_by_ticket", { p_event_id: eventId, p_ticket_id: ticketId });
  if (error) return { status: "error", message: dbMessage(error) };
  const r = data as { result: string; ticket?: { attendee_name?: string; ticket_type?: string } };
  const who = r.ticket?.attendee_name ? `${r.ticket.attendee_name} (${r.ticket.ticket_type})` : "Ticket";
  const messages: Record<string, ActionState> = {
    accepted: { status: "success", message: `Checked in: ${who}.` },
    already_checked_in: { status: "error", message: `${who} is already checked in.` },
    refunded: { status: "error", message: `${who} — this ticket was refunded.` },
    cancelled: { status: "error", message: `${who} — this ticket was cancelled.` },
    wrong_event: { status: "error", message: `${who} — this ticket is for a different event.` },
    invalid: { status: "error", message: "This ticket isn't valid." },
  };
  revalidatePath(`/admin/check-in/${eventId}`);
  return messages[r.result] ?? { status: "error", message: "Unexpected result." };
}

// ---------------------------------------------------------------- staff (owner only)
const staffSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email({ error: "Enter a valid email address." })),
  display_name: z.string().trim().min(1, "Enter a name.").max(120),
  role: z.enum(["owner", "admin", "checkin"]),
});

function tempPassword(): string {
  // 4 groups of 5 from an unambiguous set + guaranteed classes => meets the 12+ char policy.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const b = randomBytes(20);
  const body = Array.from(b, (x) => alphabet[x % alphabet.length]).join("");
  return `${body.slice(0, 5)}-${body.slice(5, 10)}-${body.slice(10, 15)}-${body.slice(15, 20)}-Aa9`;
}

export async function createStaffMember(_prev: ActionState, form: FormData): Promise<ActionState> {
  const staff = await staffForAction(["owner"]);
  if ("error" in staff) return { status: "error", message: staff.error };
  const parsed = staffSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return invalid(parsed.error, form);

  const password = tempPassword();
  const { data, error } = await serviceDb().auth.admin.createUser({
    email: parsed.data.email, password, email_confirm: true,
  });
  if (error || !data.user) {
    return { status: "error", message: /already/i.test(error?.message ?? "") ? "A user with that email already exists." : "Couldn't create the account. Please try again." };
  }
  // The role grant runs under the OWNER's own MFA-verified session (audited with their id).
  const { error: roleErr } = await staff.db.rpc("owner_set_staff", {
    p_user_id: data.user.id, p_role: parsed.data.role, p_is_active: true, p_display_name: parsed.data.display_name,
  });
  if (roleErr) {
    await serviceDb().auth.admin.deleteUser(data.user.id);
    return { status: "error", message: dbMessage(roleErr) };
  }
  revalidatePath("/admin/staff");
  return {
    status: "success",
    message: `Account created for ${parsed.data.email}. Share this temporary password privately — it won't be shown again. They'll set up their authenticator app at first sign-in, then can change the password under My account.`,
    secret: password,
  };
}

export async function staffOperation(_prev: ActionState, form: FormData): Promise<ActionState> {
  const staff = await staffForAction(["owner"]);
  if ("error" in staff) return { status: "error", message: staff.error };
  const userId = form.get("user_id");
  const op = form.get("op");
  if (!isUuid(userId)) return { status: "error", message: "Invalid request." };
  const { data: current } = await staff.db.from("admin_profiles").select("role, is_active").eq("user_id", userId).single();
  if (!current) return { status: "error", message: "Staff member not found." };

  if (op === "role" || op === "deactivate" || op === "activate") {
    const role = op === "role" ? String(form.get("role")) : current.role;
    if (!["owner", "admin", "checkin"].includes(role)) return { status: "error", message: "Invalid role." };
    const active = op === "deactivate" ? false : op === "activate" ? true : current.is_active;
    const { error } = await staff.db.rpc("owner_set_staff", { p_user_id: userId, p_role: role as StaffRole, p_is_active: active });
    if (error) return { status: "error", message: dbMessage(error) };
    revalidatePath("/admin/staff");
    return { status: "success", message: op === "role" ? "Role updated." : active ? "Access restored." : "Access removed. Their next request is refused." };
  }
  if (op === "reset_mfa") {
    if (userId === staff.user.id) return { status: "error", message: "You can't reset your own authenticator here." };
    const admin = serviceDb().auth.admin;
    const { data: list } = await admin.mfa.listFactors({ userId });
    for (const f of list?.factors ?? []) await admin.mfa.deleteFactor({ userId, id: f.id });
    return { status: "success", message: "Authenticator reset. They'll set up a new one at their next sign-in." };
  }
  return { status: "error", message: "Invalid request." };
}

// ---------------------------------------------------------------- inbox
export async function markMessage(form: FormData): Promise<void> {
  const staff = await staffForAction(["owner", "admin"]);
  if ("error" in staff) return;
  const id = form.get("id");
  const status = form.get("status");
  if (!isUuid(id) || !["new", "handled", "spam"].includes(String(status))) return;
  await staff.db.from("contact_submissions").update({ status, handled_at: status === "new" ? null : new Date().toISOString() }).eq("id", id);
  revalidatePath("/admin/inbox");
}
