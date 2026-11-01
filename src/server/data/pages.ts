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

// ---------------------------------------------------------------- custom pages
export const CUSTOM_PAGES_CACHE_TAG = "custom-pages";

export interface CustomPageLink { slug: string; title: string }

/** A published custom page (/policies/<slug>), or null. Drafts and hidden pages are never returned. */
export type CustomPage = Omit<StoredPolicy, "slug"> & { slug: string };

export async function getCustomPage(slug: string): Promise<CustomPage | null> {
  "use cache";
  cacheTag(CUSTOM_PAGES_CACHE_TAG);
  cacheLife("hours");
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60) return null;
  const { data, error } = await publicDb()
    .from("custom_pages").select("title, body, updated_at").eq("slug", slug).eq("published", true).maybeSingle();
  if (error) throw new Error(`custom page ${slug}: ${error.message}`);
  if (!data) return null;
  return { slug, title: data.title, text: data.body, updated: fmt.format(new Date(data.updated_at)), edited: true };
}

/** Published pages, for the sitemap and (when show_in_footer) the footer. Empty if the database is unreachable. */
export async function listPublishedPages(): Promise<(CustomPageLink & { showInFooter: boolean })[]> {
  "use cache";
  cacheTag(CUSTOM_PAGES_CACHE_TAG);
  cacheLife("hours");
  try {
    const { data, error } = await publicDb()
      .from("custom_pages").select("slug, title, show_in_footer").eq("published", true)
      .order("footer_position").order("title");
    if (error) throw error;
    return (data ?? []).map((p) => ({ slug: p.slug, title: p.title, showInFooter: p.show_in_footer }));
  } catch (e) {
    console.error("[pages] couldn't list custom pages", e);
    return [];
  }
}
