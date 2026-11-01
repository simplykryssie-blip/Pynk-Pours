import { toCsv } from "@/lib/csv";
import { sessionDb } from "@/server/auth/session";

export async function GET() {
  const db = await sessionDb();
  const { data: role } = await db.rpc("current_staff_role");
  if (role !== "owner" && role !== "admin") return new Response("Forbidden", { status: 403 });
  const { data, error } = await db.from("newsletter_subscribers").select("email, source, consented_at").is("unsubscribed_at", null).order("consented_at");
  if (error) return new Response("Export failed", { status: 500 });
  return new Response(toCsv(["Email", "Source", "Subscribed"], data.map((r) => [r.email, r.source, r.consented_at])), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="pynkpours-newsletter.csv"', "Cache-Control": "private, no-store" },
  });
}
