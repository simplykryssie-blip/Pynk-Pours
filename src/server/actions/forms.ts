"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { FILE_TYPES, MAX_FILE_BYTES, validateResponse, type FormField } from "@/lib/forms";
import { looksAutomated } from "@/lib/validation";
import { encryptCredential, generatePublicToken } from "../credentials";
import { sendQueuedEmailsSoon } from "../email/outbox";
import { envSubset } from "../env";
import { withinRateLimit } from "../request";
import { serviceDb } from "../supabase";

const FORM_BUCKET = "form-uploads";

export interface PublicFormState {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Answers sent back so the form keeps them after an error (React resets forms after an action). */
  values?: Record<string, string | string[]>;
}

type OpenForm = { id: string; slug: string; status: string; closes_at: string | null; fields: FormField[]; notify_staff: boolean };

async function openForm(slug: string): Promise<OpenForm | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60) return null;
  const { data } = await serviceDb().from("forms")
    .select("id, slug, status, closes_at, fields, notify_staff").eq("slug", slug).maybeSingle();
  const f = data as OpenForm | null;
  if (!f || f.status !== "open" || (f.closes_at && new Date(f.closes_at) <= new Date())) return null;
  return f;
}

/**
 * A one-time link to upload one file straight to private storage (files never
 * pass through our server, so large photos and PDFs work on phones).
 */
export async function requestUpload(input: { slug: string; field: string; filename: string; size: number; type: string }):
  Promise<{ ok: true; path: string; token: string } | { ok: false; message: string }> {
  const form = await openForm(String(input.slug));
  if (!form) return { ok: false, message: "This form isn't accepting responses." };
  const field = form.fields.find((f) => f.key === input.field && f.type === "file");
  if (!field) return { ok: false, message: "Upload not allowed here." };
  if (!FILE_TYPES[input.type]) return { ok: false, message: "Please upload a PDF or a photo (JPEG, PNG, WebP or HEIC)." };
  if (!(input.size > 0 && input.size <= MAX_FILE_BYTES)) return { ok: false, message: "Files can be up to 10 MB." };
  if (!(await withinRateLimit("form-upload", 40, 3600))) return { ok: false, message: "Too many uploads. Please wait a few minutes." };
  const safe = String(input.filename).normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-120) || "file";
  const path = `pending/${form.id}/${randomUUID()}/${safe}`;
  const { data, error } = await serviceDb().storage.from(FORM_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error("[forms] signed upload failed", error?.message);
    return { ok: false, message: "Uploads aren't working right now. Please try again." };
  }
  return { ok: true, path: data.path, token: data.token };
}

/** Check each uploaded file really exists in storage with the declared type and size. */
async function verifyUploads(paths: { path: string; contentType: string; size: number }[]): Promise<boolean> {
  const bucket = serviceDb().storage.from(FORM_BUCKET);
  for (const p of paths) {
    const dir = p.path.slice(0, p.path.lastIndexOf("/"));
    const name = p.path.slice(p.path.lastIndexOf("/") + 1);
    const { data, error } = await bucket.list(dir, { search: name, limit: 5 });
    const obj = data?.find((o) => o.name === name);
    const meta = obj?.metadata as { size?: number; mimetype?: string } | undefined;
    if (error || !meta || meta.size !== p.size || meta.mimetype !== p.contentType) return false;
  }
  return true;
}

export async function submitForm(_prev: PublicFormState, form: FormData): Promise<PublicFormState> {
  const slug = String(form.get("form_slug") ?? "");
  const f = await openForm(slug);
  if (!f) return { status: "error", message: "This form isn't accepting responses right now." };
  if (looksAutomated(form)) return { status: "error", message: "Please wait a moment and try again." };

  const raw: Record<string, string | string[]> = {};
  for (const field of f.fields) {
    const all = form.getAll(field.key).filter((v): v is string => typeof v === "string");
    raw[field.key] = field.type === "checkboxes" || field.type === "file" ? all : (all[0] ?? "");
  }
  const result = validateResponse(f.fields, raw, f.id);
  if (!result.ok) return { status: "error", message: "Please fix the highlighted questions.", fieldErrors: result.fieldErrors, values: raw };
  if (!(await withinRateLimit("form-submit", 6, 600)) || !(await withinRateLimit("form-submit-email", 5, 3600, result.email))) {
    return { status: "error", message: "Too many submissions. Please wait a few minutes and try again.", values: raw };
  }
  const uploads = Object.entries(result.files).flatMap(([key, list]) => list.map((x) => ({ ...x, key })));
  if (uploads.length && !(await verifyUploads(uploads))) {
    return { status: "error", message: "One of your files didn't finish uploading. Please remove it and add it again.", values: raw };
  }

  const db = serviceDb();
  const { TICKET_CREDENTIAL_KEY } = envSubset(["TICKET_CREDENTIAL_KEY"]);
  const { token, hash } = generatePublicToken();
  const { data: sub, error } = await db.from("form_submissions").insert({
    form_id: f.id, data: result.data, name: result.name, email: result.email,
    status_token_hash: hash, status_token_ciphertext: encryptCredential(token, TICKET_CREDENTIAL_KEY),
  }).select("id").single();
  if (error || !sub) {
    console.error("[forms] submission insert failed", error?.message);
    return { status: "error", message: "We couldn't save your response. Please try again.", values: raw };
  }
  if (uploads.length) {
    const { error: fileErr } = await db.from("form_files").insert(uploads.map((u) => ({
      submission_id: sub.id, field_key: u.key, storage_path: u.path, filename: u.filename, content_type: u.contentType, size_bytes: u.size,
    })));
    if (fileErr) console.error("[forms] file records failed", fileErr.message);
  }
  const emails = [{ dedupe_key: `form_receipt:${sub.id}`, kind: "form_receipt", to_email: result.email }];
  const inbox = process.env.CONTACT_INBOX_EMAIL?.trim().toLowerCase();
  if (f.notify_staff && inbox) emails.push({ dedupe_key: `form_notification:${sub.id}`, kind: "form_notification", to_email: inbox });
  const { error: mailErr } = await db.from("email_messages").insert(emails);
  if (mailErr) console.error("[forms] email enqueue failed", mailErr.message);
  sendQueuedEmailsSoon();
  redirect(`/forms/status/${token}?sent=1`);
}
