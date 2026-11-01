import { z } from "zod";
import { EVENT_TIMEZONES, zonedLocalToUtc } from "./zoned-time";

/** Turn a title into a URL slug ("The Brunch!" -> "the-brunch"). */
export function slugify(input: string): string {
  return input
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    .slice(0, 80).replace(/-+$/g, "");
}

/** "$1,250.50" / "25" -> cents. Rejects negatives and more than 2 decimals. */
export function parsePriceToCents(input: string): number | null {
  const clean = input.trim().replace(/[$,\s]/g, "");
  if (clean === "") return null;
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(clean)) return null;
  const [whole, frac = ""] = clean.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

const opt = (max: number) => z.string().trim().max(max).transform((v) => (v === "" ? null : v));
const optInt = (min: number, max: number, msg: string) =>
  z.string().trim().transform((v, ctx) => {
    if (v === "") return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) {
      ctx.addIssue({ code: "custom", message: msg });
      return z.NEVER;
    }
    return n;
  });
// Unticked checkboxes are omitted from form submissions entirely, so the key is optional.
const bool = z.union([z.literal("on"), z.literal("true"), z.literal(""), z.null()]).optional().transform((v) => v === "on" || v === "true");
const tz = z.enum(EVENT_TIMEZONES.map((t) => t.value) as [string, ...string[]], { error: "Choose a timezone." });

const agendaItem = z.object({ time: z.string().trim().max(40).optional(), title: z.string().trim().min(1).max(200), description: z.string().trim().max(1000).optional() });
const faqItem = z.object({ question: z.string().trim().min(1).max(300), answer: z.string().trim().min(1).max(3000) });
const speakerItem = z.object({ name: z.string().trim().min(1).max(160), title: z.string().trim().max(160).optional(), bio: z.string().trim().max(2000).optional() });
const jsonList = <T extends z.ZodTypeAny>(item: T, max: number) =>
  z.string().transform((v, ctx) => {
    try {
      const parsed = z.array(item).max(max).safeParse(v ? JSON.parse(v) : []);
      if (!parsed.success) throw new Error();
      return parsed.data as z.infer<T>[];
    } catch {
      ctx.addIssue({ code: "custom", message: "Please check this list — every row needs the required fields." });
      return z.NEVER;
    }
  });

export const eventFormSchema = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(160),
  slug: z.string().trim().max(80).transform((v) => v),
  category_label: opt(60),
  short_description: opt(400),
  description: opt(20000),
  timezone: tz,
  starts_local: z.string().trim(),
  ends_local: z.string().trim(),
  registration_closes_local: z.string().trim(),
  is_online: bool,
  venue_name: opt(200),
  venue_address: opt(500),
  venue_notes: opt(2000),
  dress_code: opt(300),
  parking_info: opt(2000),
  accessibility_info: opt(2000),
  refund_policy: opt(4000),
  min_age: optInt(1, 99, "Age must be between 1 and 99."),
  capacity: optInt(0, 100000, "Capacity must be a whole number."),
  max_tickets_per_order: optInt(1, 50, "Between 1 and 50.").transform((v) => v ?? 10),
  show_remaining_count: bool,
  registration_mode: z.enum(["coming_soon", "tickets", "closed"]),
  sold_out_behavior: z.enum(["sold_out", "waitlist"]),
  is_featured: bool,
  agenda: jsonList(agendaItem, 50),
  faqs: jsonList(faqItem, 50),
  speakers: jsonList(speakerItem, 30),
}).transform((v, ctx) => {
  const slug = slugify(v.slug || v.title);
  if (!slug) ctx.addIssue({ code: "custom", path: ["slug"], message: "Enter a URL name using letters and numbers." });
  const toUtc = (local: string, field: string) => {
    if (!local) return null;
    try {
      return zonedLocalToUtc(local, v.timezone);
    } catch (e) {
      ctx.addIssue({ code: "custom", path: [field], message: (e as Error).message });
      return null;
    }
  };
  const starts_at = toUtc(v.starts_local, "starts_local");
  const ends_at = toUtc(v.ends_local, "ends_local");
  const registration_closes_at = toUtc(v.registration_closes_local, "registration_closes_local");
  if (starts_at && ends_at && ends_at <= starts_at) ctx.addIssue({ code: "custom", path: ["ends_local"], message: "End must be after the start." });
  if (ends_at && !starts_at) ctx.addIssue({ code: "custom", path: ["starts_local"], message: "Add a start time." });
  if (registration_closes_at && ends_at && registration_closes_at > ends_at) {
    ctx.addIssue({ code: "custom", path: ["registration_closes_local"], message: "Registration must close before the event ends." });
  }
  const rest: Partial<typeof v> = { ...v };
  delete rest.starts_local;
  delete rest.ends_local;
  delete rest.registration_closes_local;
  return { ...(rest as Omit<typeof v, "starts_local" | "ends_local" | "registration_closes_local">), slug, starts_at, ends_at, registration_closes_at, currency: "usd" };
});

export type EventPayload = z.output<typeof eventFormSchema>;

export const ticketFormSchema = z.object({
  name: z.string().trim().min(1, "Enter a ticket name.").max(120),
  description: opt(2000),
  inclusions: z.string().max(4000).transform((v) => v.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 20)),
  price: z.string().transform((v, ctx) => {
    const cents = parsePriceToCents(v);
    if (cents === null) {
      ctx.addIssue({ code: "custom", message: "Enter a price like 25 or 25.00 (use 0 for free)." });
      return z.NEVER;
    }
    return cents;
  }),
  admits_per_unit: optInt(1, 20, "Between 1 and 20 guests.").transform((v) => v ?? 1),
  capacity: optInt(0, 100000, "Quantity must be a whole number (leave blank for no limit)."),
  max_per_order: optInt(1, 50, "Between 1 and 50 (leave blank for the event default)."),
  sales_start_local: z.string().trim(),
  sales_end_local: z.string().trim(),
  status: z.enum(["active", "paused", "closed"]),
});

export function ticketPayload(input: z.output<typeof ticketFormSchema>, timeZone: string | null) {
  const conv = (local: string) => {
    if (!local) return null;
    if (!timeZone) throw new Error("Set the event's timezone (Details tab) before adding sale dates.");
    return zonedLocalToUtc(local, timeZone);
  };
  const sales_start_at = conv(input.sales_start_local);
  const sales_end_at = conv(input.sales_end_local);
  if (sales_start_at && sales_end_at && sales_end_at <= sales_start_at) throw new Error("Sales must end after they start.");
  return {
    name: input.name, description: input.description, inclusions: input.inclusions, price_cents: input.price,
    admits_per_unit: input.admits_per_unit, capacity: input.capacity, max_per_order: input.max_per_order,
    status: input.status, sales_start_at, sales_end_at,
  };
}
