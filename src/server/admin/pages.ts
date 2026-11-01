"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { POLICY_SLUGS, type PolicySlug } from "@/content/policies";
import { parsePolicyText } from "@/lib/policy-text";
import { staffForAction } from "../auth/staff";
import { POLICY_CACHE_TAG } from "../data/pages";
import { dbMessage, invalid, type ActionState } from "./common";

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
