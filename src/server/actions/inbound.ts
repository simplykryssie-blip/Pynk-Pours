"use server";

import {
  contactSchema, fieldErrors, interestSchema, looksAutomated, newsletterSchema,
} from "@/lib/validation";
import { deriveRegistration } from "@/lib/registration";
import { getEventBySlug, getTicketOptions } from "../data/events";
import { withinRateLimit } from "../request";
import { serviceDb } from "../supabase";
import type { FormState } from "./types";

const GENERIC_ERROR = "Something went wrong on our side. Please try again in a moment.";
const RATE_LIMITED = "Too many attempts. Please wait a few minutes and try again.";

function pick(form: FormData, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, typeof form.get(k) === "string" ? String(form.get(k)) : ""]));
}

// ---------------------------------------------------------------------------
export async function submitContact(_prev: FormState, form: FormData): Promise<FormState> {
  const values = pick(form, ["name", "email", "topic", "subject", "message"]);
  // Bots get a success-looking response so they learn nothing.
  if (looksAutomated(form)) return { status: "success", message: "Thank you — your message has been sent." };

  const parsed = contactSchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error), values };
  }
  if (!(await withinRateLimit("contact", 5, 600))) return { status: "error", message: RATE_LIMITED, values };

  const { error } = await serviceDb().from("contact_submissions").insert(parsed.data);
  if (error) {
    console.error(`[contact] insert failed: ${error.message}`);
    return { status: "error", message: GENERIC_ERROR, values };
  }
  // Staff notification email is sent via the outbox in Stage E.
  return { status: "success", message: "Thank you — your message has been sent. We'll be in touch soon." };
}

// ---------------------------------------------------------------------------
export async function subscribeNewsletter(_prev: FormState, form: FormData): Promise<FormState> {
  const values = pick(form, ["email", "source"]);
  const ok: FormState = { status: "success", message: "You're on the list. Welcome to the circle!" };
  if (looksAutomated(form)) return ok;

  const parsed = newsletterSchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", message: "Please check your email address.", fieldErrors: fieldErrors(parsed.error), values };
  }
  if (!(await withinRateLimit("newsletter", 10, 3600))) return { status: "error", message: RATE_LIMITED, values };

  const { error } = await serviceDb()
    .from("newsletter_subscribers")
    .upsert({ email: parsed.data.email, source: parsed.data.source ?? null }, { onConflict: "email", ignoreDuplicates: true });
  if (error) {
    console.error(`[newsletter] upsert failed: ${error.message}`);
    return { status: "error", message: GENERIC_ERROR, values };
  }
  // Same response whether or not the address was already subscribed (no enumeration).
  return ok;
}

// ---------------------------------------------------------------------------
export async function registerInterest(_prev: FormState, form: FormData): Promise<FormState> {
  const values = pick(form, ["eventSlug", "kind", "name", "email", "quantity"]);
  const okMessage = values.kind === "waitlist"
    ? "You're on the waitlist. We'll email you if a spot opens up."
    : "You're on the list. We'll email you as soon as details are announced.";
  if (looksAutomated(form)) return { status: "success", message: okMessage };

  const parsed = interestSchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error), values };
  }
  if (!(await withinRateLimit("event-interest", 10, 3600))) return { status: "error", message: RATE_LIMITED, values };

  // Server decides whether this kind of sign-up is allowed for the event right now.
  const event = await getEventBySlug(parsed.data.eventSlug);
  if (!event) return { status: "error", message: "This event is no longer available.", values };
  const reg = deriveRegistration(event, await getTicketOptions(event.id));
  const allowed = parsed.data.kind === "waitlist"
    ? reg.state === "waitlist"
    : ["coming_soon", "not_yet_on_sale", "on_sale"].includes(reg.state);
  if (!allowed) return { status: "error", message: "Sign-ups aren't open for this event right now.", values };

  const { error } = await serviceDb().from("event_interest").upsert(
    {
      event_id: event.id, kind: parsed.data.kind, email: parsed.data.email,
      name: parsed.data.name ?? null, quantity: parsed.data.quantity ?? null,
    },
    { onConflict: "event_id,kind,email", ignoreDuplicates: true },
  );
  if (error) {
    console.error(`[interest] upsert failed: ${error.message}`);
    return { status: "error", message: GENERIC_ERROR, values };
  }
  return { status: "success", message: okMessage };
}
