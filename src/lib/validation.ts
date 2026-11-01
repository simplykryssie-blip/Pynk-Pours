import { z } from "zod";

/** Shared input rules for public forms. Server actions are the enforcement point. */

const email = z
  .string({ error: "Enter your email address." })
  .trim()
  .toLowerCase()
  .max(254, "Email address is too long.")
  .pipe(z.email({ error: "Enter a valid email address." }));

const name = z
  .string({ error: "Enter your name." })
  .trim()
  .min(1, "Enter your name.")
  .max(160, "Name is too long.");

export const contactSchema = z.object({
  name,
  email,
  topic: z.enum(["general", "partnership", "event", "press"], { error: "Choose a topic." }),
  subject: z.string().trim().max(200, "Subject is too long.").optional().transform((v) => v || undefined),
  message: z
    .string({ error: "Enter a message." })
    .trim()
    .min(10, "Please write a little more (at least 10 characters).")
    .max(5000, "Message is too long (5,000 characters max)."),
});

export const newsletterSchema = z.object({
  email,
  source: z.string().trim().max(60).regex(/^[a-z0-9-]*$/).optional().transform((v) => v || undefined),
});

export const interestSchema = z.object({
  eventSlug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80),
  kind: z.enum(["notify", "waitlist"]),
  name: z.string().trim().max(160, "Name is too long.").optional().transform((v) => v || undefined),
  email,
  quantity: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().min(1).max(10).optional(),
  ),
});

export type FieldErrors = Partial<Record<string, string>>;

export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

/** Anti-spam checks shared by every public form. */
export const HONEYPOT_FIELD = "company_website";
export const STARTED_AT_FIELD = "started_at";
export const MIN_FILL_MS = 2500;

export function looksAutomated(form: FormData, now = Date.now()): boolean {
  const honeypot = form.get(HONEYPOT_FIELD);
  if (typeof honeypot === "string" && honeypot.trim() !== "") return true;
  const started = Number(form.get(STARTED_AT_FIELD));
  if (!Number.isFinite(started) || started <= 0) return true;
  return now - started < MIN_FILL_MS;
}
