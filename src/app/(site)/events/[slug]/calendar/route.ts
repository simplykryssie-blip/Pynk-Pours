import { connection } from "next/server";
import { buildIcs } from "@/lib/ics";
import { DataUnavailableError, getEventBySlug } from "@/server/data/events";

export async function GET(_req: Request, ctx: RouteContext<"/events/[slug]/calendar">) {
  await connection();
  const { slug } = await ctx.params;
  let event;
  try {
    event = await getEventBySlug(slug);
  } catch (e) {
    if (e instanceof DataUnavailableError) return new Response("Temporarily unavailable", { status: 503 });
    throw e;
  }
  if (!event || !event.starts_at || event.status === "cancelled") {
    return new Response("Not found", { status: 404 });
  }
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const location = event.is_online ? "Online" : [event.venue_name, event.venue_address].filter(Boolean).join(", ") || null;
  const body = buildIcs({
    uid: `${event.id}@pynkpours.com`,
    title: event.title,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    location,
    description: event.short_description,
    url: `${site}/events/${event.slug}`,
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.slug}.ics"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
