"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseFields, SUBMISSION_STATUSES, VENDOR_TEMPLATE, type FormField, type SubmissionStatus } from "@/lib/forms";
import { staffForAction } from "../auth/staff";
import { sendQueuedEmailsSoon } from "../email/outbox";
import { serviceDb } from "../supabase";
import { dbMessage, formValues, invalid, isUuid, type ActionState } from "./common";

const FORM_BUCKET = "form-uploads";

const toSlug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50).replace(/-+$/, "") || "form";

/** Owner/admin: start a new form, blank or from the vendor application template. */
export async function createForm(_prev: ActionState, form: FormData): Promise<ActionState> {
  const staff = await staffForAction(["owner", "admin"]);
  if ("error" in staff) return { status: "error", message: staff.error };
  const title = String(form.get("title") ?? "").trim();
  if (!title || title.length > 120) return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: { title: "Enter a title (up to 120 characters)." }, values: formValues(form) };
  const vendor = form.get("template") === "vendor";
  const fields: FormField[] = vendor ? VENDOR_TEMPLATE : [
    { key: "name", type: "short_text", label: "Your name", required: true },
    { key: "email", type: "email", label: "Email", required: true },
  ];
  const base = toSlug(title);
  for (let n = 0; n < 20; n++) {
    const slug = n === 0 ? base : `${base}-${n + 1}`;
    const { data, error } = await staff.db.from("forms").insert({
      slug, title, purpose: vendor ? "vendor" : "general", fields, updated_by: staff.user.id,
      description: vendor ? "Interested in being a vendor at a PynkPours event? Tell us about your business. We review every application and will email you." : "",
    }).select("id").single();
    if (!error) { revalidatePath("/admin/forms"); redirect(`/admin/forms/${data.id}?created=1`); }
    if (error.code !== "23505") return { status: "error", message: dbMessage(error), values: formValues(form) };
  }
  return { status: "error", message: "Couldn't pick a web address. Try a different title.", values: formValues(form) };
}

const settingsSchema = z.object({
  id: z.string().refine(isUuid, "Invalid request."),
  title: z.string().trim().min(1, "Enter a title.").max(120),
  slug: z.string().trim().toLowerCase().min(2, "Enter a web address.").max(60)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single dashes only."),
  description: z.string().max(5000, "Keep the introduction under 5,000 characters."),
  confirmation_message: z.string().max(2000, "Keep the thank-you message under 2,000 characters."),
  status: z.enum(["draft", "open", "closed"]),
  event_id: z.string().refine((v) => v === "" || isUuid(v), "Invalid event."),
  closes_at: z.string().refine((v) => v === "" || !Number.isNaN(Date.parse(v)), "Enter a valid date."),
  fields: z.string().max(200_000),
});

/** Owner/admin: save a form's settings and questions. */
export async function saveForm(_prev: ActionState, form: FormData): Promise<ActionState> {
  const staff = await staffForAction(["owner", "admin"]);
  if ("error" in staff) return { status: "error", message: staff.error };
  const parsed = settingsSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return invalid(parsed.error, form);
  const v = parsed.data;
  let rawFields: unknown;
  try { rawFields = JSON.parse(v.fields); } catch { return { status: "error", message: "The questions couldn't be read. Please refresh and try again." }; }
  const fields = parseFields(rawFields);
  if (!fields.ok) return { status: "error", message: fields.message, values: formValues(form) };
  const { error } = await staff.db.from("forms").update({
    title: v.title, slug: v.slug, description: v.description.trim(), confirmation_message: v.confirmation_message.trim(),
    status: v.status, event_id: v.event_id || null,
    // The date picker gives a local date; the form closes at the end of that day in Lake Charles.
    closes_at: v.closes_at ? new Date(`${v.closes_at}T23:59:59-06:00`).toISOString() : null,
    notify_staff: form.get("notify_staff") === "on", fields: fields.fields, updated_by: staff.user.id,
  }).eq("id", v.id);
  if (error) {
    if (error.code === "23505") return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: { slug: "Another form already uses this address." }, values: formValues(form) };
    return { status: "error", message: dbMessage(error), values: formValues(form) };
  }
  revalidatePath("/admin/forms", "layout");
  const live = v.status === "open" ? ` It's live at /forms/${v.slug}.` : v.status === "closed" ? " It's closed to new responses." : " It's a draft (not visible on the website).";
  return { status: "success", message: `Form saved.${live}`, nonce: crypto.randomUUID() };
}

const statusSchema = z.object({
  id: z.string().refine(isUuid, "Invalid request."),
  status: z.enum(SUBMISSION_STATUSES.map((s) => s.value) as [SubmissionStatus, ...SubmissionStatus[]]),
  message: z.string().max(5000, "Keep the message under 5,000 characters."),
});

/** Owner/admin: change a response's status, optionally emailing the applicant. */
export async function updateSubmissionStatus(_prev: ActionState, form: FormData): Promise<ActionState> {
  const staff = await staffForAction(["owner", "admin"]);
  if ("error" in staff) return { status: "error", message: staff.error };
  const parsed = statusSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return invalid(parsed.error, form);
  const { id, status, message } = parsed.data;
  const notify = form.get("notify") === "on";
  const { data: sub, error } = await staff.db.from("form_submissions")
    .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: staff.user.id }).eq("id", id).select("email").single();
  if (error || !sub) return { status: "error", message: error ? dbMessage(error) : "That response no longer exists." };
  const { data: upd, error: updErr } = await staff.db.from("form_status_updates")
    .insert({ submission_id: id, status, message: message.trim(), notify, created_by: staff.user.id }).select("id").single();
  if (updErr) return { status: "error", message: dbMessage(updErr) };
  if (notify) {
    const { error: mailErr } = await serviceDb().from("email_messages")
      .insert({ dedupe_key: `form_status:${upd.id}`, kind: "form_status", to_email: sub.email, requested_by: staff.user.id });
    if (mailErr) return { status: "error", message: "Status saved, but the email couldn't be queued. Please try again." };
    sendQueuedEmailsSoon();
  }
  revalidatePath("/admin/forms", "layout");
  const label = SUBMISSION_STATUSES.find((s) => s.value === status)!.label;
  return { status: "success", message: notify ? `Marked ${label}. The applicant has been emailed.` : `Marked ${label}.`, nonce: crypto.randomUUID() };
}

/** Owner/admin: private notes on a response. */
export async function saveSubmissionNotes(_prev: ActionState, form: FormData): Promise<ActionState> {
  const staff = await staffForAction(["owner", "admin"]);
  if ("error" in staff) return { status: "error", message: staff.error };
  const id = form.get("id");
  const notes = String(form.get("staff_notes") ?? "");
  if (!isUuid(id) || notes.length > 5000) return { status: "error", message: "Invalid request." };
  const { error } = await staff.db.from("form_submissions")
    .update({ staff_notes: notes.trim(), reviewed_by: staff.user.id, reviewed_at: new Date().toISOString() }).eq("id", id);
  if (error) return { status: "error", message: dbMessage(error) };
  revalidatePath(`/admin/forms/responses/${id}`);
  return { status: "success", message: "Notes saved.", nonce: crypto.randomUUID() };
}

/** Owner/admin: permanently delete a response and its files (e.g. a privacy request). Audited. */
export async function deleteSubmission(_prev: ActionState, form: FormData): Promise<ActionState> {
  const staff = await staffForAction(["owner", "admin"]);
  if ("error" in staff) return { status: "error", message: staff.error };
  const id = form.get("id");
  if (!isUuid(id)) return { status: "error", message: "Invalid request." };
  const { data: sub } = await staff.db.from("form_submissions").select("form_id, form_files(storage_path)").eq("id", id).maybeSingle();
  if (!sub) return { status: "error", message: "That response no longer exists." };
  const paths = ((sub as unknown as { form_files: { storage_path: string }[] }).form_files ?? []).map((f) => f.storage_path);
  const { error } = await staff.db.from("form_submissions").delete().eq("id", id);
  if (error) return { status: "error", message: dbMessage(error) };
  if (paths.length) {
    const { error: rmErr } = await serviceDb().storage.from(FORM_BUCKET).remove(paths);
    if (rmErr) console.error("[forms] file cleanup failed", rmErr.message);
  }
  revalidatePath("/admin/forms", "layout");
  redirect(`/admin/forms/${sub.form_id}/responses?deleted=1`);
}
