/**
 * Form builder: field definitions and server-side validation of responses.
 * Pure (no I/O) so it can be unit tested and shared by the builder, the public
 * form and the server action. Responses are always validated against the
 * form's own field list; anything not on the form is discarded.
 */
import { z } from "zod";

export const FIELD_TYPES = [
  { value: "short_text", label: "Short answer" },
  { value: "long_text", label: "Paragraph" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "url", label: "Website / link" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Dropdown (pick one)" },
  { value: "radio", label: "Multiple choice (pick one)" },
  { value: "checkboxes", label: "Checkboxes (pick any)" },
  { value: "yes", label: "Single checkbox (agree / yes)" },
  { value: "file", label: "File upload" },
] as const;
export type FieldType = (typeof FIELD_TYPES)[number]["value"];

/** For vendor applications: which vendor detail a field fills in. */
export const VENDOR_MAPPINGS = [
  { value: "", label: "—" },
  { value: "business_name", label: "Business name" },
  { value: "contact_name", label: "Contact name" },
  { value: "phone", label: "Phone" },
  { value: "category", label: "Category (what they sell)" },
  { value: "website", label: "Website" },
  { value: "instagram", label: "Instagram" },
] as const;
export type VendorMapping = Exclude<(typeof VENDOR_MAPPINGS)[number]["value"], "">;

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_FIELD = 5;
export const FILE_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "image/heic": "HEIC",
  "image/heif": "HEIF",
};

export interface FormField {
  key: string;
  type: FieldType;
  label: string;
  help?: string;
  required?: boolean;
  options?: string[];
  vendor?: VendorMapping;
}

const keyRe = /^[a-z][a-z0-9_]{0,39}$/;

export const fieldSchema = z.object({
  key: z.string().regex(keyRe),
  type: z.enum(FIELD_TYPES.map((t) => t.value) as [FieldType, ...FieldType[]]),
  label: z.string().trim().min(1, "Every question needs a label.").max(200),
  help: z.string().trim().max(500).optional().default(""),
  required: z.boolean().optional().default(false),
  options: z.array(z.string().trim().min(1).max(120)).max(30).optional().default([]),
  vendor: z.enum(VENDOR_MAPPINGS.filter((m) => m.value).map((m) => m.value) as [VendorMapping, ...VendorMapping[]]).optional(),
});

export const CHOICE_TYPES: FieldType[] = ["select", "radio", "checkboxes"];

/** Validate a field list from the builder. Returns a human message on failure. */
export function parseFields(input: unknown): { ok: true; fields: FormField[] } | { ok: false; message: string } {
  const parsed = z.array(fieldSchema).max(40, "A form can have up to 40 questions.").safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Some questions aren't valid." };
  const fields = parsed.data as FormField[];
  const keys = new Set<string>();
  for (const f of fields) {
    if (keys.has(f.key)) return { ok: false, message: "Two questions have the same internal name." };
    keys.add(f.key);
    if (CHOICE_TYPES.includes(f.type) && (f.options?.length ?? 0) < 1) return { ok: false, message: `“${f.label}” needs at least one choice.` };
    if (!CHOICE_TYPES.includes(f.type)) f.options = [];
  }
  const emails = fields.filter((f) => f.type === "email");
  if (emails.length === 0) return { ok: false, message: "Add an Email question, so you can reply and send status updates." };
  if (!emails[0].required) return { ok: false, message: "The first Email question must be required." };
  const vendorKeys = fields.map((f) => f.vendor).filter(Boolean);
  if (new Set(vendorKeys).size !== vendorKeys.length) return { ok: false, message: "Each vendor detail can only be filled by one question." };
  return { ok: true, fields };
}

/** Internal key from a label, unique within the form. */
export function fieldKey(label: string, taken: Set<string>): string {
  const base = (label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30) || "question").replace(/^(\d)/, "q_$1");
  let k = base, n = 2;
  while (taken.has(k)) k = `${base}_${n++}`;
  return k;
}

export type AnswerValue = string | string[] | boolean;
export interface UploadedFile { path: string; filename: string; contentType: string; size: number }

/** Paths the server issued for this form: pending/<formId>/<uuid>/<name>. */
export const uploadPathRe = (formId: string) =>
  new RegExp(`^pending/${formId}/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$`);

/**
 * Validate a response. `raw` maps field keys to submitted strings (multi-value
 * fields: arrays). File fields carry JSON descriptors of already-uploaded files,
 * which the caller must verify exist in Storage.
 */
export function validateResponse(fields: FormField[], raw: Record<string, string | string[] | undefined>, formId: string):
  | { ok: true; data: Record<string, AnswerValue>; files: Record<string, UploadedFile[]>; email: string; name: string | null }
  | { ok: false; fieldErrors: Record<string, string> } {
  const data: Record<string, AnswerValue> = {};
  const files: Record<string, UploadedFile[]> = {};
  const errors: Record<string, string> = {};
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
  const pathRe = uploadPathRe(formId);

  for (const f of fields) {
    const v = raw[f.key];
    const req = f.required ? `“${f.label}” is required.` : null;
    switch (f.type) {
      case "checkboxes": {
        const picked = (Array.isArray(v) ? v : v ? [v] : []).map((s) => s.trim()).filter(Boolean);
        if (picked.some((p) => !f.options?.includes(p))) { errors[f.key] = "Please choose from the list."; break; }
        if (f.required && picked.length === 0) { errors[f.key] = req!; break; }
        if (picked.length) data[f.key] = [...new Set(picked)];
        break;
      }
      case "yes": {
        const on = one(v) === "on" || one(v) === "yes";
        if (f.required && !on) { errors[f.key] = req!; break; }
        data[f.key] = on;
        break;
      }
      case "file": {
        const list: UploadedFile[] = [];
        for (const s of (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean)) {
          try {
            const d = JSON.parse(s) as UploadedFile;
            if (typeof d.path !== "string" || !pathRe.test(d.path) || typeof d.filename !== "string" || !FILE_TYPES[d.contentType]
              || typeof d.size !== "number" || d.size < 1 || d.size > MAX_FILE_BYTES) throw new Error("bad");
            list.push({ path: d.path, filename: d.filename.slice(0, 200), contentType: d.contentType, size: d.size });
          } catch { errors[f.key] = "That upload didn't work. Please remove it and try again."; }
        }
        if (errors[f.key]) break;
        if (list.length > MAX_FILES_PER_FIELD) { errors[f.key] = `Upload up to ${MAX_FILES_PER_FIELD} files.`; break; }
        if (f.required && list.length === 0) { errors[f.key] = req!; break; }
        if (list.length) { files[f.key] = list; data[f.key] = list.map((x) => x.filename); }
        break;
      }
      default: {
        const s = one(v);
        if (!s) { if (req) errors[f.key] = req; break; }
        const max = f.type === "long_text" ? 5000 : 500;
        if (s.length > max) { errors[f.key] = `Keep this under ${max.toLocaleString()} characters.`; break; }
        if (f.type === "email" && !z.email().safeParse(s).success) { errors[f.key] = "Enter a valid email address."; break; }
        if (f.type === "url" && !/^(https?:\/\/)?[^\s/$.?#].[^\s]*$/i.test(s)) { errors[f.key] = "Enter a valid web address."; break; }
        if (f.type === "phone" && !/^[0-9+()\-.\s]{7,25}$/.test(s)) { errors[f.key] = "Enter a valid phone number."; break; }
        if (f.type === "number" && !/^-?\d+(\.\d+)?$/.test(s)) { errors[f.key] = "Enter a number."; break; }
        if (f.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(s)) { errors[f.key] = "Enter a date."; break; }
        if ((f.type === "select" || f.type === "radio") && !f.options?.includes(s)) { errors[f.key] = "Please choose from the list."; break; }
        data[f.key] = f.type === "email" ? s.toLowerCase() : s;
      }
    }
  }
  if (Object.keys(errors).length) return { ok: false, fieldErrors: errors };
  const emailField = fields.find((f) => f.type === "email")!;
  const nameField = fields.find((f) => f.vendor === "contact_name") ?? fields.find((f) => f.type === "short_text" && /name/i.test(f.label));
  const name = nameField && typeof data[nameField.key] === "string" ? (data[nameField.key] as string).slice(0, 200) : null;
  return { ok: true, data, files, email: data[emailField.key] as string, name };
}

/** Text shown for an answer in the dashboard, emails and CSV. */
export function answerText(v: AnswerValue | undefined): string {
  if (v === undefined) return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return Array.isArray(v) ? v.join(", ") : v;
}

export const SUBMISSION_STATUSES = [
  { value: "new", label: "New" },
  { value: "reviewing", label: "Under review" },
  { value: "approved", label: "Approved" },
  { value: "waitlisted", label: "Waitlisted" },
  { value: "declined", label: "Declined" },
] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number]["value"];
/** Badge colour (admin StatusBadge style) for each response status. */
export const STATUS_BADGE: Record<string, string> = { new: "pending", reviewing: "partially_refunded", approved: "paid", waitlisted: "paused", declined: "failed" };
export const statusLabel = (s: string) => SUBMISSION_STATUSES.find((x) => x.value === s)?.label ?? s;

/** A ready-made vendor application the owner can start from and edit. */
export const VENDOR_TEMPLATE: FormField[] = [
  { key: "business_name", type: "short_text", label: "Business name", required: true, vendor: "business_name" },
  { key: "contact_name", type: "short_text", label: "Your name", required: true, vendor: "contact_name" },
  { key: "email", type: "email", label: "Email", required: true },
  { key: "phone", type: "phone", label: "Phone", required: true, vendor: "phone" },
  { key: "category", type: "select", label: "What do you sell?", required: true, vendor: "category",
    options: ["Food", "Drinks", "Desserts & baked goods", "Beauty & wellness", "Fashion & accessories", "Art & home", "Services", "Other"] },
  { key: "description", type: "long_text", label: "Tell us about your business and what you'd bring", required: true },
  { key: "website", type: "url", label: "Website", vendor: "website" },
  { key: "instagram", type: "short_text", label: "Instagram handle", help: "e.g. @yourbusiness", vendor: "instagram" },
  { key: "needs_power", type: "radio", label: "Do you need electricity?", required: true, options: ["Yes", "No"] },
  { key: "photos", type: "file", label: "Photos of your products or booth", help: "JPEG, PNG or PDF, up to 10 MB each." },
  { key: "documents", type: "file", label: "License, permit or insurance (if you have them)", help: "PDF or photo, up to 10 MB each." },
  { key: "agree", type: "yes", label: "I agree to follow PynkPours vendor guidelines and event rules.", required: true },
];
