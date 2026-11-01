"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eventFormSchema } from "@/lib/admin-schemas";
import { staffForAction } from "../auth/staff";
import { isEventOperation, type EventOperation } from "@/components/admin/event-ops";
import { dbMessage, invalid, isUuid, type ActionState } from "./common";

const MANAGERS = ["owner", "admin"] as const;

function refresh(eventId?: string) {
  revalidatePath("/admin", "layout");
  revalidatePath("/", "layout");
  if (eventId) revalidatePath(`/admin/events/${eventId}`, "layout");
}

export async function createEvent(_prev: ActionState, form: FormData): Promise<ActionState> {
  const staff = await staffForAction([...MANAGERS]);
  if ("error" in staff) return { status: "error", message: staff.error };
  const parsed = eventFormSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return invalid(parsed.error, form);
  const { data, error } = await staff.db.from("events").insert(parsed.data).select("id").single();
  if (error) return { status: "error", message: dbMessage(error), values: Object.fromEntries([...form].filter(([, v]) => typeof v === "string")) as Record<string, string> };
  refresh();
  redirect(`/admin/events/${data.id}/tickets?created=1`);
}

export async function updateEvent(_prev: ActionState, form: FormData): Promise<ActionState> {
  const staff = await staffForAction([...MANAGERS]);
  if ("error" in staff) return { status: "error", message: staff.error };
  const id = form.get("id");
  if (!isUuid(id)) return { status: "error", message: "Missing event." };
  const parsed = eventFormSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return invalid(parsed.error, form);
  const { error } = await staff.db.from("events").update(parsed.data).eq("id", id);
  if (error) return { status: "error", message: dbMessage(error) };
  refresh(id);
  return { status: "success", message: "Event saved." };
}

const OP_UPDATES: Record<Exclude<EventOperation, "duplicate">, Record<string, unknown>> = {
  publish: { status: "published" },
  unpublish: { status: "draft" },
  cancel: { status: "cancelled" },
  complete: { status: "completed" },
  archive: {},
  unarchive: { archived_at: null },
};

export async function eventOperation(_prev: ActionState, form: FormData): Promise<ActionState> {
  const staff = await staffForAction([...MANAGERS]);
  if ("error" in staff) return { status: "error", message: staff.error };
  const id = form.get("id");
  const op = form.get("op");
  if (!isUuid(id) || !isEventOperation(op)) return { status: "error", message: "Invalid request." };
  // Return to the tab the action came from, with a confirmation banner.
  const back = String(form.get("return_to") ?? "");
  const returnTo = new RegExp(`^/admin/events/${id}(/(tickets|media|registrations))?$`).test(back) ? back : `/admin/events/${id}`;

  if (op === "duplicate") {
    const { data, error } = await staff.db.rpc("admin_duplicate_event", { p_event_id: id });
    if (error) return { status: "error", message: dbMessage(error) };
    refresh();
    redirect(`/admin/events/${data}?duplicated=1`);
  }
  const update = op === "archive" ? { archived_at: new Date().toISOString() } : OP_UPDATES[op];
  const { error } = await staff.db.from("events").update(update).eq("id", id);
  if (error) return { status: "error", message: dbMessage(error) };
  refresh(id);
  redirect(`${returnTo}?done=${op}`);
}

export async function deleteDraftEvent(form: FormData): Promise<void> {
  const staff = await staffForAction([...MANAGERS]);
  if ("error" in staff) return;
  const id = form.get("id");
  if (!isUuid(id)) return;
  // RLS only allows deleting never-published drafts; tiers/questions are removed first.
  await staff.db.from("ticket_types").delete().eq("event_id", id);
  await staff.db.from("event_questions").delete().eq("event_id", id);
  const { error } = await staff.db.from("events").delete().eq("id", id);
  if (!error) {
    refresh();
    redirect("/admin/events?deleted=1");
  }
}
