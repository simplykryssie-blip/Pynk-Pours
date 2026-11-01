import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import type { ZodError } from "zod";
import { fieldErrors, type FieldErrors } from "@/lib/validation";

export interface ActionState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: FieldErrors;
  values?: Record<string, string>;
  /** Shown once (e.g. a temporary password). */
  secret?: string;
  /** Unique per successful submission — lets forms reset themselves. */
  nonce?: string;
}

export const idle: ActionState = { status: "idle" };

const FRIENDLY: Record<string, string> = {
  forbidden: "You don't have permission to do that.",
  invalid_request: "That request wasn't valid. Please refresh and try again.",
  last_owner: "At least one active owner is required.",
  attendee_not_found: "That attendee no longer exists.",
  event_not_found: "That event no longer exists.",
  ticket_not_valid: "That ticket isn't valid.",
  event_unavailable: "That event isn't available.",
};

/** Map database errors to safe, human messages. Constraint messages we wrote are already human. */
export function dbMessage(error: PostgrestError | { code?: string; message: string }): string {
  if (error.code === "23505") {
    if (/slug/.test(error.message)) return "That web address is already used by another event. Choose a different one.";
    return "That already exists.";
  }
  if (error.code === "23514" && !/violates check constraint/.test(error.message)) return error.message;
  if (error.code === "23503") return "This can't be removed because it has orders or other records attached.";
  if (error.code === "42501" || /row-level security/.test(error.message)) return FRIENDLY.forbidden;
  if (FRIENDLY[error.message]) return FRIENDLY[error.message];
  if (error.code === "23514") return "Some values aren't allowed. Please check the form.";
  console.error("[admin] database error", error);
  return "Something went wrong saving your changes. Please try again.";
}

export function formValues(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

export function invalid(err: ZodError, form: FormData): ActionState {
  return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: fieldErrors(err), values: formValues(form) };
}

export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
