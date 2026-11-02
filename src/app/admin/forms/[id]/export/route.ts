import { toCsv, type CsvValue } from "@/lib/csv";
import { answerText, statusLabel, type AnswerValue, type FormField } from "@/lib/forms";
import { sessionDb } from "@/server/auth/session";

/** CSV of a form's responses (admins only; audited in the database). */
export async function GET(_req: Request, ctx: RouteContext<"/admin/forms/[id]/export">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found", { status: 404 });
  const db = await sessionDb();
  const { data: role } = await db.rpc("current_staff_role");
  if (role !== "owner" && role !== "admin") return new Response("Forbidden", { status: 403 });
  const { data: form } = await db.from("forms").select("slug, fields").eq("id", id).maybeSingle();
  if (!form) return new Response("Not found", { status: 404 });
  const { data, error } = await db.rpc("export_form_responses", { p_form_id: id });
  if (error) return new Response("Export failed", { status: 500 });
  const fields = form.fields as FormField[];
  const headers = ["Submitted", "Status", "Name", "Email", ...fields.map((f) => f.label), "Staff notes"];
  const rows: CsvValue[][] = (data as { created_at: string; status: string; name: string | null; email: string; data: Record<string, AnswerValue>; staff_notes: string }[])
    .map((r) => [r.created_at, statusLabel(r.status), r.name, r.email, ...fields.map((f) => answerText(r.data[f.key])), r.staff_notes]);
  return new Response(toCsv(headers, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pynkpours-${form.slug}-responses.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
