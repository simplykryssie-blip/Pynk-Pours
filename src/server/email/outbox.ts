import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { eventWhen, eventWhere } from "@/components/events/format";
import {
  contactNotificationEmail, orderConfirmationEmail, ticketEmail, type EmailContent, type EventFacts,
} from "@/lib/email-templates";
import { formatMoney } from "@/lib/money";
import { publicSiteUrl } from "@/lib/site-url";
import { orderTokenFor } from "../checkout/tokens";
import { decryptCredential } from "../credentials";
import { qrPng } from "../qr";
import { serviceDb } from "../supabase";
import { emailConfigured, sendEmail, type OutgoingEmail } from "./resend";

/**
 * Sends queued transactional emails (public.email_messages). Rows are enqueued
 * exactly once by the database (fulfill_order, enqueue_ticket_resend) or by the
 * contact form. claim_due_emails() locks a batch so concurrent runs never send
 * the same message twice; failures back off exponentially (up to 8 attempts).
 */
interface QueuedEmail {
  id: string;
  dedupe_key: string;
  kind: "order_confirmation" | "ticket" | "ticket_resend" | "contact_notification";
  order_id: string | null;
  ticket_id: string | null;
  to_email: string;
  attempts: number;
}

export interface OutboxResult { claimed: number; sent: number; failed: number; skipped?: string }

function staffUrl(path: string): string {
  const host = process.env.ADMIN_HOST?.trim().toLowerCase();
  return host && /^[a-z0-9.-]+$/.test(host) ? `https://${host}${path}` : publicSiteUrl(path);
}

const replyTo = () => process.env.EMAIL_REPLY_TO || process.env.CONTACT_INBOX_EMAIL || "hello@pynkpours.com";

type EventRow = { title: string; starts_at: string | null; ends_at: string | null; timezone: string | null; is_online: boolean; venue_name: string | null };

function eventFacts(ev: EventRow): EventFacts {
  const when = eventWhen(ev);
  return { title: ev.title, date: when.date, time: when.time, where: eventWhere(ev) };
}

async function loadOrder(db: SupabaseClient, orderId: string) {
  const { data, error } = await db
    .from("orders")
    .select("id, order_number, purchaser_name, total_cents, currency, payment_provider, checkout_idempotency_key, events(title, starts_at, ends_at, timezone, is_online, venue_name), order_items(ticket_type_name, quantity, unit_price_cents)")
    .eq("id", orderId)
    .single();
  if (error || !data) throw new Error(`order ${orderId} not found`);
  return data as unknown as {
    id: string; order_number: number; purchaser_name: string; total_cents: number; currency: string;
    payment_provider: string | null; checkout_idempotency_key: string; events: EventRow;
    order_items: { ticket_type_name: string; quantity: number; unit_price_cents: number }[];
  };
}

async function build(db: SupabaseClient, m: QueuedEmail): Promise<Omit<OutgoingEmail, "from" | "idempotencyKey">> {
  if (m.kind === "order_confirmation") {
    const o = await loadOrder(db, m.order_id!);
    const content: EmailContent = orderConfirmationEmail({
      purchaserName: o.purchaser_name,
      orderNumber: o.order_number,
      event: eventFacts(o.events),
      lines: o.order_items.map((it) => ({ label: `${it.quantity} × ${it.ticket_type_name}`, amount: formatMoney(it.unit_price_cents * it.quantity, o.currency) })),
      total: formatMoney(o.total_cents, o.currency),
      free: o.total_cents === 0,
      orderUrl: publicSiteUrl(`/orders/${orderTokenFor(o.checkout_idempotency_key).token}`),
      replyTo: replyTo(),
    });
    return { to: m.to_email, replyTo: replyTo(), ...content };
  }

  if (m.kind === "ticket" || m.kind === "ticket_resend") {
    const { data: t, error } = await db
      .from("tickets")
      .select("id, status, manual_code, credential_ciphertext, order_id, attendee_id, ticket_type_id")
      .eq("id", m.ticket_id!)
      .single();
    if (error || !t) throw new Error(`ticket ${m.ticket_id} not found${error ? `: ${error.message}` : ""}`);
    const ticket = t as { id: string; status: string; manual_code: string; credential_ciphertext: string; order_id: string; attendee_id: string; ticket_type_id: string };
    if (ticket.status !== "valid") throw new SkipEmail(`ticket is ${ticket.status}`);
    // tickets → attendees/ticket_types use composite keys, so look the names up directly.
    const [{ data: attendee }, { data: tier }] = await Promise.all([
      db.from("attendees").select("full_name").eq("id", ticket.attendee_id).single(),
      db.from("ticket_types").select("name").eq("id", ticket.ticket_type_id).single(),
    ]);
    if (!attendee || !tier) throw new Error(`ticket ${ticket.id}: attendee or ticket type missing`);
    const o = await loadOrder(db, ticket.order_id);
    const key = process.env.TICKET_CREDENTIAL_KEY;
    if (!key) throw new Error("TICKET_CREDENTIAL_KEY is not set");
    const credential = decryptCredential(ticket.credential_ciphertext, key);
    const cid = `ticket-${ticket.id}`;
    const content = ticketEmail({
      attendeeName: attendee.full_name,
      ticketType: tier.name,
      manualCode: ticket.manual_code,
      event: eventFacts(o.events),
      orderUrl: publicSiteUrl(`/orders/${orderTokenFor(o.checkout_idempotency_key).token}#ticket-${ticket.manual_code}`),
      qrCid: cid,
      replyTo: replyTo(),
      resend: m.kind === "ticket_resend",
    });
    return {
      to: m.to_email, replyTo: replyTo(), ...content,
      attachments: [{ filename: `pynkpours-ticket-${ticket.manual_code}.png`, content: await qrPng(credential), contentId: cid, contentType: "image/png" }],
    };
  }

  // contact_notification: dedupe_key is "contact:<submission id>"
  const submissionId = m.dedupe_key.split(":")[1];
  const { data: c, error } = await db
    .from("contact_submissions").select("name, email, topic, subject, message").eq("id", submissionId).single();
  if (error || !c) throw new Error(`contact submission ${submissionId} not found`);
  const content = contactNotificationEmail({ ...c, inboxUrl: staffUrl("/admin/inbox") });
  return { to: m.to_email, replyTo: c.email, ...content };
}

class SkipEmail extends Error {}

export async function processOutbox(limit = 20, db: SupabaseClient = serviceDb()): Promise<OutboxResult> {
  if (!emailConfigured()) return { claimed: 0, sent: 0, failed: 0, skipped: "email not configured" };
  const { data, error } = await db.rpc("claim_due_emails", { p_limit: limit });
  if (error) throw new Error(`claim_due_emails: ${error.message}`);
  const batch = (data ?? []) as QueuedEmail[];
  let sent = 0, failed = 0;
  for (const m of batch) {
    try {
      const e = await build(db, m);
      const { id } = await sendEmail({ ...e, from: process.env.EMAIL_FROM!, idempotencyKey: `pynkpours:${m.dedupe_key}` });
      await db.rpc("mark_email_result", { p_id: m.id, p_success: true, p_provider_message_id: id });
      sent++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // A refunded/cancelled ticket is never emailed: record as done, not as a retryable failure.
      const skip = err instanceof SkipEmail;
      await db.rpc("mark_email_result", {
        p_id: m.id, p_success: skip, p_provider_message_id: skip ? `skipped: ${message}` : null, p_error: skip ? null : message,
      });
      if (!skip) {
        failed++;
        console.error(`[email] ${m.kind} ${m.id} attempt ${m.attempts}: ${message}`);
      }
    }
  }
  return { claimed: batch.length, sent, failed };
}

/** Send whatever is queued once the current response has been sent (never blocks the guest). */
export function sendQueuedEmailsSoon(): void {
  after(async () => {
    try {
      await processOutbox();
    } catch (e) {
      console.error("[email] outbox run failed:", (e as Error).message);
    }
  });
}
