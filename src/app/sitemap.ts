import type { MetadataRoute } from "next";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { listPublicEvents } from "@/server/data/events";
import { listPublishedPages } from "@/server/data/pages";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const custom = (await listPublishedPages()).map((p) => `/policies/${p.slug}`);
  const pages = ["", "/experiences", "/events", "/about", "/partners", "/contact", "/privacy", "/terms", "/refunds", ...custom].map((p) => ({ url: `${site}${p}` }));
  try {
    const events = await listPublicEvents();
    return [...pages, ...events.filter((e) => e.status !== "cancelled").map((e) => ({ url: `${site}/events/${e.slug}` }))];
  } catch (e) {
    unstable_rethrow(e);
    return pages;
  }
}
