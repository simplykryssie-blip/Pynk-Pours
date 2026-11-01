/**
 * LOCAL ONLY sample data for development and end-to-end tests.
 *
 * Every sample record is labelled "SAMPLE" and is NOT real PynkPours event
 * information. The one exception is the Entrepreneurial Brunch, which uses
 * only owner-supplied brand copy (name + description from the approved
 * prototype) with NO date, venue, price or speakers, as a "coming soon" page.
 *
 * Refuses to run against anything except the local Supabase database.
 * Usage: npx tsx scripts/db/seed-local-sample.ts
 */
import { Client } from "pg";

const DB_URL = process.env.LOCAL_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
if (!/@(127\.0\.0\.1|localhost):\d+\//.test(DB_URL)) {
  console.error("Refusing to seed a non-local database.");
  process.exit(1);
}

const days = (n: number, hourUtc = 17) => {
  const d = new Date(Date.now() + n * 86_400_000);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d.toISOString();
};

async function main() {
  const db = new Client({ connectionString: DB_URL });
  await db.connect();
  await db.query("begin");
  // Idempotent: remove previous sample rows (only those created by this script).
  await db.query(`delete from public.event_interest where event_id in (select id from public.events where slug like 'sample-%' or slug = 'entrepreneurial-brunch')`);
  await db.query(`delete from public.ticket_types where event_id in (select id from public.events where slug like 'sample-%' or slug = 'entrepreneurial-brunch')`);
  await db.query(`delete from public.events where slug like 'sample-%' or slug = 'entrepreneurial-brunch'`);

  const insertEvent = async (e: Record<string, unknown>) => {
    const cols = Object.keys(e);
    const { rows } = await db.query(
      `insert into public.events (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) returning id`,
      Object.values(e).map((v) => (typeof v === "object" && v !== null ? JSON.stringify(v) : v)),
    );
    return rows[0].id as string;
  };
  const tier = (eventId: string, t: Record<string, unknown>) => {
    const cols = ["event_id", ...Object.keys(t)];
    return db.query(
      `insert into public.ticket_types (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})`,
      [eventId, ...Object.values(t).map((v) => (Array.isArray(v) ? JSON.stringify(v) : v))],
    );
  };
  const publish = (id: string) => db.query("update public.events set status = 'published' where id = $1", [id]);

  // 1) Entrepreneurial Brunch — owner brand copy only; no invented details.
  const brunch = await insertEvent({
    slug: "entrepreneurial-brunch",
    title: "The Entrepreneurial Brunch",
    category_label: "Signature Experience",
    short_description:
      "Our signature entrepreneurial gathering brings business owners, emerging founders, and creative thinkers together for conversation, connection, practical insight, and intentional networking.",
    description:
      "Big ideas deserve the right room. Event date, venue, ticket details, and speaker announcements will be shared here as they are confirmed.",
    registration_mode: "coming_soon",
    is_featured: true,
  });
  await publish(brunch);

  // 2) SAMPLE on-sale event with flexible tiers (fictional).
  const social = await insertEvent({
    slug: "sample-networking-social",
    title: "SAMPLE Networking Social (not a real event)",
    category_label: "Sample",
    short_description: "SAMPLE DATA for local development. Not a real PynkPours event.",
    description: "This sample event exists only to exercise the event page layout.\n\nIt is not real.",
    starts_at: days(21, 23), ends_at: days(22, 2), timezone: "America/Chicago",
    venue_name: "Sample Venue (fictional)", venue_address: "123 Example Street, Example City",
    dress_code: "Sample dress code", min_age: 21,
    agenda: [{ time: "6:00 PM", title: "Sample welcome" }, { time: "7:00 PM", title: "Sample networking" }],
    faqs: [{ question: "Is this a real event?", answer: "No. This is sample data for development." }],
    registration_mode: "tickets",
    show_remaining_count: true,
  });
  await tier(social, { name: "Sample General Admission", price_cents: 2500, capacity: 40, sort_order: 0,
    inclusions: ["Sample inclusion one", "Sample inclusion two"] });
  await tier(social, { name: "Sample VIP", price_cents: 6000, capacity: 10, sort_order: 1, max_per_order: 2,
    description: "Optional premium tier (VIP is never required)." });
  await publish(social);

  // 3) SAMPLE sold-out event with waitlist (fictional).
  const soldOut = await insertEvent({
    slug: "sample-sold-out-workshop",
    title: "SAMPLE Sold-Out Workshop (not a real event)",
    category_label: "Sample",
    short_description: "SAMPLE DATA: demonstrates the sold-out + waitlist state.",
    starts_at: days(35), ends_at: days(35, 20), timezone: "America/Chicago",
    is_online: true, registration_mode: "tickets", sold_out_behavior: "waitlist",
  });
  await tier(soldOut, { name: "Sample Seat", price_cents: 1500, capacity: 0 });
  await publish(soldOut);

  // 4) SAMPLE past event (fictional).
  const past = await insertEvent({
    slug: "sample-past-gathering",
    title: "SAMPLE Past Gathering (not a real event)",
    category_label: "Sample",
    short_description: "SAMPLE DATA: demonstrates the past-events view.",
    starts_at: days(-30), ends_at: days(-30, 20), timezone: "America/Chicago",
    venue_name: "Sample Venue (fictional)", registration_mode: "closed",
  });
  await publish(past);

  // 5) SAMPLE draft — must never appear publicly.
  await insertEvent({
    slug: "sample-draft-hidden",
    title: "SAMPLE DRAFT — must not be public",
    short_description: "If you can see this on the public site, RLS is broken.",
    registration_mode: "coming_soon",
  });

  await db.query("commit");
  await db.end();
  console.log("Seeded local SAMPLE data (5 events: 4 public, 1 draft).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
