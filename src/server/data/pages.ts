import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { DEFAULT_POLICIES, type PolicySlug } from "@/content/policies";
import { publicDb } from "../supabase";

export const POLICY_CACHE_TAG = "site-pages";

export interface StoredPolicy {
  slug: PolicySlug;
  title: string;
  text: string;
  /** Human date, e.g. "November 1, 2026". */
  updated: string;
  /** True when the text comes from the dashboard rather than the built-in default. */
  edited: boolean;
}

const fmt = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "America/Chicago" });

/**
 * A policy as published. Cached; editing it in the dashboard refreshes the cache
 * immediately (updateTag). Falls back to the built-in text if nothing has been
 * saved yet or the database is unreachable.
 */
export async function getPolicy(slug: PolicySlug): Promise<StoredPolicy> {
  "use cache";
  cacheTag(POLICY_CACHE_TAG);
  cacheLife("hours");
  const fallback = DEFAULT_POLICIES[slug];
  try {
    const { data, error } = await publicDb()
      .from("site_pages").select("title, body, updated_at").eq("slug", slug).maybeSingle();
    if (error) throw error;
    if (data) return { slug, title: data.title, text: data.body, updated: fmt.format(new Date(data.updated_at)), edited: true };
  } catch (e) {
    console.error(`[pages] couldn't load ${slug}; showing the built-in text`, e);
  }
  return { slug, title: fallback.title, text: fallback.text, updated: fallback.updated, edited: false };
}
