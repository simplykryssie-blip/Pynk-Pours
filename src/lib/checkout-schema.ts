import { z } from "zod";

/**
 * Guest checkout form. Field names: purchaser_*, sel (JSON of {ticket_type_id, quantity}),
 * and per admission i: att_<i>_tt / att_<i>_name / att_<i>_email / att_<i>_phone / att_<i>_q_<questionId>.
 * The server re-derives everything else (prices, totals, availability) from the database.
 */
const email = z.string().trim().toLowerCase().max(254).pipe(z.email({ error: "Enter a valid email address." }));
const name = z.string().trim().min(1, "Enter a name.").max(160, "Name is too long.");
const phone = z.string().trim().max(40, "Phone number is too long.").regex(/^[0-9+().\-\s]*$/, "Use digits, spaces and + ( ) - only.");

export const selectionSchema = z
  .array(z.object({ ticket_type_id: z.uuid(), quantity: z.number().int().min(1).max(50) }))
  .min(1, "Choose at least one ticket.")
  .max(20);

export function parseSelectionParam(raw: string | null | undefined) {
  // "tierId:qty,tierId:qty" (URL) -> [{ ticket_type_id, quantity }]
  const parts = (raw ?? "").split(",").map((p) => p.split(":")).filter((p) => p.length === 2);
  const merged = new Map<string, number>();
  for (const [id, q] of parts) merged.set(id, (merged.get(id) ?? 0) + Number(q));
  const out = [...merged].map(([ticket_type_id, quantity]) => ({ ticket_type_id, quantity }));
  const parsed = selectionSchema.safeParse(out);
  return parsed.success ? parsed.data : null;
}

export interface ParsedCheckout {
  eventSlug: string;
  idempotencyKey: string;
  purchaser: { name: string; email: string; phone: string | null };
  items: { ticket_type_id: string; quantity: number }[];
  attendees: { ticket_type_id: string; full_name: string; email: string; phone: string | null; answers: Record<string, string> }[];
  agreed: boolean;
  ageConfirmed: boolean;
}

export function parseCheckoutForm(form: FormData): { ok: true; data: ParsedCheckout } | { ok: false; fieldErrors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const get = (k: string) => (typeof form.get(k) === "string" ? String(form.get(k)) : "");
  const check = <T>(key: string, schema: z.ZodType<T>, value: unknown): T | undefined => {
    const r = schema.safeParse(value);
    if (!r.success) errors[key] = r.error.issues[0].message;
    return r.success ? r.data : undefined;
  };

  const slug = get("event_slug");
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) errors.form = "Invalid event.";
  const key = get("idempotency_key");
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(key)) errors.form = "Please reload the page and try again.";
  let items: ParsedCheckout["items"] | undefined;
  try {
    items = check("form", selectionSchema, JSON.parse(get("sel") || "[]"));
  } catch {
    errors.form = "Please choose your tickets again.";
  }

  const pName = check("purchaser_name", name, get("purchaser_name"));
  const pEmail = check("purchaser_email", email, get("purchaser_email"));
  const pPhone = check("purchaser_phone", phone, get("purchaser_phone"));

  const attendees: ParsedCheckout["attendees"] = [];
  for (let i = 0; i < 200 && form.has(`att_${i}_tt`); i++) {
    const tt = get(`att_${i}_tt`);
    const nm = check(`att_${i}_name`, name, get(`att_${i}_name`));
    const em = check(`att_${i}_email`, email, get(`att_${i}_email`));
    const ph = check(`att_${i}_phone`, phone, get(`att_${i}_phone`));
    const answers: Record<string, string> = {};
    for (const [k, v] of form.entries()) {
      const m = new RegExp(`^att_${i}_q_([0-9a-f-]{36})$`).exec(k);
      if (m && typeof v === "string" && v.trim()) answers[m[1]] = v.trim().slice(0, 1000);
    }
    attendees.push({ ticket_type_id: tt, full_name: nm ?? "", email: em ?? "", phone: ph || null, answers });
  }
  const agreed = form.get("agree") === "on";
  if (!agreed) errors.agree = "Please confirm you've read the event details and refund policy.";
  const ageConfirmed = form.get("age_confirm") === "on";
  if (form.get("age_required") === "true" && !ageConfirmed) errors.age_confirm = "Every guest must meet the minimum age for this event.";

  if (Object.keys(errors).length > 0 || !items || !pName || !pEmail) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    data: {
      eventSlug: slug, idempotencyKey: key, items, attendees, agreed, ageConfirmed,
      purchaser: { name: pName, email: pEmail, phone: pPhone || null },
    },
  };
}

/** Friendly messages for create_pending_order() business errors. */
export const CHECKOUT_ERRORS: Record<string, string> = {
  sold_out: "Sorry — there aren't enough tickets left for your selection. Please adjust and try again.",
  ticket_type_not_on_sale: "One of the tickets you chose is no longer on sale.",
  exceeds_max_per_order: "Your selection is over the per-order limit.",
  attendee_count_mismatch: "Please enter details for every guest.",
  missing_required_answer: "Please answer the required questions for every guest.",
  event_unavailable: "This event is not available for registration.",
  registration_not_open: "Registration for this event isn't open.",
  ticket_type_not_found: "One of the tickets you chose is no longer available.",
  invalid_quantity: "Please choose a valid number of tickets.",
};
