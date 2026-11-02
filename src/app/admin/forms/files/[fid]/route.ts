import { sessionDb } from "@/server/auth/session";
import { serviceDb } from "@/server/supabase";

/** Staff download of an uploaded file: a link valid for 60 seconds, after the role check. */
export async function GET(_req: Request, ctx: RouteContext<"/admin/forms/files/[fid]">) {
  const { fid } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(fid)) return new Response("Not found", { status: 404 });
  const db = await sessionDb();
  const { data: role } = await db.rpc("current_staff_role");
  if (role !== "owner" && role !== "admin") return new Response("Forbidden", { status: 403 });
  // Read through the staff session: RLS confirms access to this file record.
  const { data: file } = await db.from("form_files").select("storage_path, filename").eq("id", fid).maybeSingle();
  if (!file) return new Response("Not found", { status: 404 });
  const { data, error } = await serviceDb().storage.from("form-uploads").createSignedUrl(file.storage_path, 60, { download: file.filename });
  if (error || !data) return new Response("File unavailable", { status: 502 });
  return new Response(null, { status: 303, headers: { Location: data.signedUrl, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
