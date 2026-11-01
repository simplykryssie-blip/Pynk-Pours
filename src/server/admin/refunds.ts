"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { refundAmount } from "@/lib/refunds";
import { refundParams } from "@/lib/stripe-params";
import { staffForAction, type Staff } from "../auth/staff";
import { stripeClient } from "../payments/stripe";
import { serviceDb } from "../supabase";
import { dbMessage, isUuid, type ActionState } from "./common";

interface OrderForRefund {
  id: string; status: string; total_cents: number; amount_refunded_cents: number; stripe_payment_intent_id: string | null;
  payment_provider: string | null; event_id: string;
  order_items: { id: string; unit_price_cents: number; admits_per_unit: number }[];
  attendees: { id: string; order_item_id: string; position: number; tickets: { id: string; status: string } | { id: string; status: string }[] | null }[];
}

async function loadOrder(staff: Staff, orderId: string): Promise<OrderForRefund | null> {
  // Read through the admin's own MFA-verified session (RLS: owner/admin only).
  const { data } = await staff.db
    .from("orders")
    .select("id, status, total_cents, amount_refunded_cents, stripe_payment_intent_id, payment_provider, event_id, order_items(id, unit_price_cents, admits_per_unit), attendees(id, order_item_id, position, tickets(id, status))")
    .eq("id", orderId)
    .maybeSingle();
  return data as OrderForRefund | null;
}

function ticketsOf(o: OrderForRefund) {
  return o.attendees.flatMap((a) => {
    const t = Array.isArray(a.tickets) ? a.tickets[0] : a.tickets;
    return t ? [{ id: t.id, order_item_id: a.order_item_id, position: a.position, status: t.status }] : [];
  });
}

/**
 * Refund specific tickets (or the whole order) through Stripe, then record it.
 * The Stripe call uses an idempotency key derived from the exact request, so a
 * double-click can't refund twice; the database records each Stripe refund id
 * once, so the follow-up charge.refunded webhook is a no-op.
 */
async function refundOne(staff: Staff, order: OrderForRefund, selected: string[], release: boolean, reason: string): Promise<ActionState> {
  if (!["paid", "partially_refunded"].includes(order.status)) return { status: "error", message: "Only paid orders can be refunded." };
  const tickets = ticketsOf(order);
  const remaining = order.total_cents - order.amount_refunded_cents;
  const { amount, ticketIds } = refundAmount(order.order_items, tickets, selected, remaining);
  if (ticketIds.length === 0) return { status: "error", message: "Choose at least one valid ticket to refund." };

  if (order.payment_provider === "free" || amount === 0) {
    const { error } = await staff.db.rpc("admin_cancel_tickets", { p_ticket_ids: ticketIds, p_release_inventory: release, p_reason: reason || "Free ticket cancelled" });
    if (error) return { status: "error", message: dbMessage(error) };
    return { status: "success", message: `${ticketIds.length} ticket(s) cancelled.` };
  }
  if (!order.stripe_payment_intent_id) return { status: "error", message: "This order has no Stripe payment to refund." };

  const idem = createHash("sha256").update([order.id, amount, ...ticketIds.sort()].join("|")).digest("hex");
  let refundId: string;
  try {
    const refund = await stripeClient().refunds.create(
      refundParams({ paymentIntent: order.stripe_payment_intent_id, amount, orderId: order.id, ticketIds, actor: staff.user.id, release, reason }),
      { idempotencyKey: `refund:${idem}` },
    );
    if (refund.status === "failed" || refund.status === "canceled") return { status: "error", message: "Stripe declined the refund." };
    refundId = refund.id;
  } catch (e) {
    console.error("[refund] stripe error:", (e as Error).message);
    return { status: "error", message: "Stripe couldn't process the refund. Nothing was changed — please try again." };
  }

  // record_refund is a server-only function; the acting admin is recorded for the audit log.
  const { data, error } = await serviceDb().rpc("record_refund", {
    p_order_id: order.id, p_amount_cents: amount, p_ticket_ids: ticketIds, p_release_inventory: release,
    p_stripe_refund_id: refundId, p_source: "admin", p_actor: staff.user.id, p_reason: reason || null,
  });
  if (error) return { status: "error", message: `Refunded in Stripe (${refundId}) but not recorded yet: ${dbMessage(error)} It will be reconciled automatically.` };
  const r = data as { outcome: string; status: string };
  return { status: "success", message: `Refunded $${(amount / 100).toFixed(2)} for ${ticketIds.length} ticket(s). Those tickets can no longer be checked in.${r.outcome === "already_recorded" ? " (Already recorded.)" : ""}` };
}

export async function refundTickets(_prev: ActionState, form: FormData): Promise<ActionState> {
  const staff = await staffForAction(["owner", "admin"]);
  if ("error" in staff) return { status: "error", message: staff.error };
  const orderId = form.get("order_id");
  if (!isUuid(orderId)) return { status: "error", message: "Invalid request." };
  const order = await loadOrder(staff, orderId);
  if (!order) return { status: "error", message: "Order not found." };
  const all = form.get("all") === "true";
  const selected = all ? ticketsOf(order).map((t) => t.id) : form.getAll("ticket_id").map(String).filter(isUuid);
  const result = await refundOne(staff, order, selected, form.get("release_inventory") === "on", String(form.get("reason") ?? "").trim());
  revalidatePath(`/admin/registrations/${orderId}`);
  revalidatePath("/admin", "layout");
  return result;
}

/** After cancelling an event: refund every remaining paid ticket on every order. */
export async function refundCancelledEvent(_prev: ActionState, form: FormData): Promise<ActionState> {
  const staff = await staffForAction(["owner", "admin"]);
  if ("error" in staff) return { status: "error", message: staff.error };
  const eventId = form.get("event_id");
  if (!isUuid(eventId)) return { status: "error", message: "Invalid request." };
  const { data: ev } = await staff.db.from("events").select("status").eq("id", eventId).single();
  if (ev?.status !== "cancelled") return { status: "error", message: "Cancel the event first, then refund its orders." };
  const { data: orders } = await staff.db.from("orders").select("id").eq("event_id", eventId).in("status", ["paid", "partially_refunded"]);
  let ok = 0;
  const failures: string[] = [];
  for (const { id } of orders ?? []) {
    const order = await loadOrder(staff, id);
    if (!order) continue;
    const r = await refundOne(staff, order, ticketsOf(order).map((t) => t.id), false, "Event cancelled");
    if (r.status === "success") ok++;
    else failures.push(r.message ?? id);
  }
  revalidatePath("/admin", "layout");
  return failures.length
    ? { status: "error", message: `Refunded ${ok} order(s); ${failures.length} need attention: ${failures.slice(0, 3).join(" / ")}` }
    : { status: "success", message: `Refunded ${ok} order(s). All their tickets are now invalid for check-in.` };
}
