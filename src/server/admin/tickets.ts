"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { ticketFormSchema, ticketPayload } from "@/lib/admin-schemas";
import { staffForAction } from "../auth/staff";
import { dbMessage, invalid, isUuid, type ActionState } from "./common";

export async function saveTicketType(_prev: ActionState, form: FormData): Promise<ActionState> {
  const staff = await staffForAction(["owner", "admin"]);
  if ("error" in staff) return { status: "error", message: staff.error };
  const eventId = form.get("event_id");
  const ticketId = form.get("id");
  if (!isUuid(eventId)) return { status: "error", message: "Missing event." };
  const parsed = ticketFormSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return invalid(parsed.error, form);

  const { data: event, error: evErr } = await staff.db.from("events").select("timezone").eq("id", eventId).single();
  if (evErr) return { status: "error", message: dbMessage(evErr) };
  let payload;
  try {
    payload = ticketPayload(parsed.data, event.timezone);
  } catch (e) {
    return { status: "error", message: (e as Error).message };
  }

  if (isUuid(ticketId)) {
    const { error } = await staff.db.from("ticket_types").update(payload).eq("id", ticketId).eq("event_id", eventId);
    if (error) return { status: "error", message: dbMessage(error) };
  } else {
    const { count } = await staff.db.from("ticket_types").select("id", { count: "exact", head: true }).eq("event_id", eventId);
    const { error } = await staff.db.from("ticket_types").insert({ ...payload, event_id: eventId, sort_order: count ?? 0 });
    if (error) return { status: "error", message: dbMessage(error) };
  }
  revalidatePath(`/admin/events/${eventId}`, "layout");
  revalidatePath("/", "layout");
  return { status: "success", message: isUuid(ticketId) ? "Ticket updated." : "Ticket added.", nonce: randomUUID() };
}

export async function ticketOperation(_prev: ActionState, form: FormData): Promise<ActionState> {
  const staff = await staffForAction(["owner", "admin"]);
  if ("error" in staff) return { status: "error", message: staff.error };
  const eventId = form.get("event_id");
  const ticketId = form.get("id");
  const op = form.get("op");
  if (!isUuid(eventId) || !isUuid(ticketId)) return { status: "error", message: "Invalid request." };

  if (op === "delete") {
    const { error } = await staff.db.from("ticket_types").delete().eq("id", ticketId).eq("event_id", eventId);
    if (error) {
      return { status: "error", message: error.code === "23503" ? "This ticket has orders, so it can't be deleted. Set it to Closed instead." : dbMessage(error) };
    }
  } else if (op === "up" || op === "down") {
    const { data: rows, error } = await staff.db.from("ticket_types").select("id").eq("event_id", eventId).order("sort_order").order("created_at");
    if (error) return { status: "error", message: dbMessage(error) };
    const ids = rows.map((r) => r.id as string);
    const i = ids.indexOf(ticketId);
    const j = op === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= ids.length) return { status: "idle" };
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const { error: e2 } = await staff.db.rpc("admin_reorder_ticket_types", { p_event_id: eventId, p_ids: ids });
    if (e2) return { status: "error", message: dbMessage(e2) };
  } else {
    return { status: "error", message: "Invalid request." };
  }
  revalidatePath(`/admin/events/${eventId}`, "layout");
  revalidatePath("/", "layout");
  return { status: "success", message: op === "delete" ? "Ticket deleted." : "Order updated." };
}
