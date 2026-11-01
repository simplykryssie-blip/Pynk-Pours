import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { listPublicEvents } from "@/server/data/events";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const pages = ["", "/experiences", "/events", "/about", "/partners", "/contact"].map((p) => ({ url: `${site}${p}` }));
  try {
    const events = await listPublicEvents();
    return [...pages, ...events.filter((e) => e.status !== "cancelled").map((e) => ({ url: `${site}/events/${e.slug}` }))];
  } catch {
    return pages;
  }
}
