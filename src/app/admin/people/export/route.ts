import { toCsv, type CsvValue } from "@/lib/csv";
import { parseSegment } from "@/lib/people";
import { sessionDb } from "@/server/auth/session";

/** CSV of the People list with the current filters (admins only; audited in the database). */
export async function GET(req: Request) {
  const db = await sessionDb();
  const { data: role } = await db.rpc("current_staff_role");
  if (role !== "owner" && role !== "admin") return new Response("Forbidden", { status: 403 });
  const u = new URL(req.url).searchParams;
  const { data, error } = await db.rpc("export_people", {
    p_search: u.get("q")?.slice(0, 100) || null, p_segment: parseSegment(u.get("segment")), p_tag: u.get("tag")?.slice(0, 30) || null,
  });
  if (error) return new Response("Export failed", { status: 500 });
  const headers = ["Email", "Name", "Phone", "First seen", "Last activity", "Events registered", "Events attended", "Events missed", "Messages", "Waitlist/notify", "Marketing permission", "Tags"];
  const rows = (data as Record<string, CsvValue>[]).map((r) => [r.email, r.name, r.phone, r.first_seen, r.last_seen, r.events_registered, r.events_attended, r.events_missed, r.inquiries, r.interest, r.marketing, Array.isArray(r.tags) ? r.tags.join(" ") : ""]);
  return new Response(toCsv(headers, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pynkpours-people-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
