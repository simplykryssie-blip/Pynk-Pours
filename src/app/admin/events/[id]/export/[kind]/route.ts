import { toCsv, type CsvValue } from "@/lib/csv";
import { sessionDb } from "@/server/auth/session";

/** CSV exports (admins only; MFA + role enforced by the database functions, and every export is audited). */
export async function GET(_req: Request, ctx: RouteContext<"/admin/events/[id]/export/[kind]">) {
  const { id, kind } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const db = await sessionDb();
  const { data: role } = await db.rpc("current_staff_role");
  if (role !== "owner" && role !== "admin") return new Response("Forbidden", { status: 403 });

  let headers: string[];
  let rows: CsvValue[][];
  if (kind === "attendees") {
    const { data, error } = await db.rpc("export_attendees", { p_event_id: id });
    if (error) return new Response("Export failed", { status: 500 });
    headers = ["Order #", "Purchaser", "Purchaser email", "Attendee", "Attendee email", "Phone", "Ticket type", "Ticket code", "Ticket status", "Checked in at", "Answers", "Order status", "Paid at"];
    rows = (data as Record<string, CsvValue>[]).map((r) => [r.order_number, r.purchaser_name, r.purchaser_email, r.attendee_name, r.attendee_email, r.attendee_phone, r.ticket_type, r.manual_code, r.ticket_status, r.checked_in_at, r.answers, r.order_status, r.paid_at]);
  } else if (kind === "sales") {
    const { data, error } = await db.rpc("export_sales", { p_event_id: id });
    if (error) return new Response("Export failed", { status: 500 });
    const usd = (c: CsvValue) => (typeof c === "number" ? (c / 100).toFixed(2) : c);
    headers = ["Order #", "Created", "Paid", "Status", "Purchaser", "Email", "Items", "Tickets", "Currency", "Subtotal", "Discount", "Fees", "Total", "Refunded", "Net", "Stripe payment", "Needs review"];
    rows = (data as Record<string, CsvValue>[]).map((r) => [r.order_number, r.created_at, r.paid_at, r.status, r.purchaser_name, r.purchaser_email, r.items, r.ticket_count, r.currency, usd(r.subtotal_cents), usd(r.discount_cents), usd(r.fee_cents), usd(r.total_cents), usd(r.amount_refunded_cents), usd(r.net_cents), r.stripe_payment_intent_id, r.needs_review]);
  } else if (kind === "interest") {
    const { data, error } = await db.from("event_interest").select("kind, name, email, quantity, created_at").eq("event_id", id).order("created_at");
    if (error) return new Response("Export failed", { status: 500 });
    headers = ["Type", "Name", "Email", "Quantity", "Signed up"];
    rows = data.map((r) => [r.kind, r.name, r.email, r.quantity, r.created_at]);
  } else {
    return new Response("Not found", { status: 404 });
  }
  return new Response(toCsv(headers, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pynkpours-${kind}-${id.slice(0, 8)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
