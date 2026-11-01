"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { POLICY_SLUGS, type PolicySlug } from "@/content/policies";
import { parsePolicyText } from "@/lib/policy-text";
import { staffForAction } from "../auth/staff";
import { CUSTOM_PAGES_CACHE_TAG, POLICY_CACHE_TAG } from "../data/pages";
import { dbMessage, formValues, invalid, isUuid, type ActionState } from "./common";

const policySchema = z.object({
  slug: z.enum(POLICY_SLUGS as [PolicySlug, ...PolicySlug[]]),
  title: z.string().trim().min(1, "Enter a title.").max(120, "Keep the title under 120 characters."),
  body: z.string().trim().min(1, "Enter the policy text.").max(60000, "That's too long (60,000 characters maximum)."),
});

/** Owner/admin: publish a new version of a policy page. Audited in the database. */
export async function savePolicy(_prev: ActionState, form: FormData): Promise<ActionState> {
  const staff = await staffForAction(["owner", "admin"]);
  if ("error" in staff) return { status: "error", message: staff.error };
  const parsed = policySchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return invalid(parsed.error, form);
  const { slug, title, body } = parsed.data;
  const content = parsePolicyText(body);
  if (content.intro.length === 0 && content.sections.length === 0) {
    return { status: "error", message: "Enter the policy text.", values: { slug, title, body } };
  }

  const row = { title, body, updated_by: staff.user.id };
  const { data: updated, error: updateError } = await staff.db.from("site_pages").update(row).eq("slug", slug).select("slug");
  if (updateError) return { status: "error", message: dbMessage(updateError), values: { slug, title, body } };
  if (!updated?.length) {
    const { error } = await staff.db.from("site_pages").insert({ slug, ...row });
    if (error) return { status: "error", message: dbMessage(error), values: { slug, title, body } };
  }

  updateTag(POLICY_CACHE_TAG);
  revalidatePath("/admin/policies");
  return { status: "success", message: `${title} published. The website shows the new version now.`, nonce: crypto.randomUUID() };
}

// ---------------------------------------------------------------- custom pages
/** Addresses already used by built-in pages can't be reused, to avoid confusion. */
const RESERVED = new Set(["privacy", "terms", "refunds", "new"]);

const customSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1, "Enter a title.").max(120, "Keep the title under 120 characters."),
  slug: z.string().trim().toLowerCase()
    .min(2, "Enter a web address of at least 2 characters.")
    .max(60, "Keep the web address under 60 characters.")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single dashes only (for example: code-of-conduct).")
    .refine((v) => !RESERVED.has(v), "That address is used by a built-in page. Choose another."),
  body: z.string().trim().min(1, "Enter the page text.").max(60000, "That's too long (60,000 characters maximum)."),
  footer_position: z.coerce.number().int().min(0).max(1000).default(100),
});

function refreshPages() {
  updateTag(CUSTOM_PAGES_CACHE_TAG);
  revalidatePath("/admin/policies");
}

/** Owner/admin: create or update a custom page. Publishing and footer listing are checkboxes. */
export async function saveCustomPage(_prev: ActionState, form: FormData): Promise<ActionState> {
  const staff = await staffForAction(["owner", "admin"]);
  if ("error" in staff) return { status: "error", message: staff.error };
  const parsed = customSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return invalid(parsed.error, form);
  const { id, title, slug, body, footer_position } = parsed.data;
  if (id && !isUuid(id)) return { status: "error", message: "Invalid request." };
  const content = parsePolicyText(body);
  if (content.intro.length === 0 && content.sections.length === 0) {
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: { body: "Enter the page text." }, values: formValues(form) };
  }
  const published = form.get("published") === "on";
  const row = { title, slug, body, published, show_in_footer: form.get("show_in_footer") === "on", footer_position, updated_by: staff.user.id };

  const result = id
    ? await staff.db.from("custom_pages").update(row).eq("id", id).select("id").single()
    : await staff.db.from("custom_pages").insert(row).select("id").single();
  if (result.error) {
    if (result.error.code === "23505") {
      return { status: "error", message: "Please fix the highlighted fields.", fieldErrors: { slug: "Another page already uses this address." }, values: formValues(form) };
    }
    return { status: "error", message: dbMessage(result.error), values: formValues(form) };
  }
  refreshPages();
  if (!id) redirect(`/admin/policies/pages/${result.data.id}?created=1`);
  return {
    status: "success",
    message: published ? `${title} saved. It's live at /policies/${slug}.` : `${title} saved. It's hidden from the website.`,
    nonce: crypto.randomUUID(),
  };
}

/** Owner/admin: permanently delete a custom page (recorded in the activity log). */
export async function deleteCustomPage(_prev: ActionState, form: FormData): Promise<ActionState> {
  const staff = await staffForAction(["owner", "admin"]);
  if ("error" in staff) return { status: "error", message: staff.error };
  const id = form.get("id");
  if (!isUuid(id)) return { status: "error", message: "Invalid request." };
  const { error } = await staff.db.from("custom_pages").delete().eq("id", id);
  if (error) return { status: "error", message: dbMessage(error) };
  refreshPages();
  redirect("/admin/policies?deleted=1");
}
