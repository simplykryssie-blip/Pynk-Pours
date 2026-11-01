/**
 * LOCAL RESEND TEST DOUBLE — for automated tests only. NOT Resend; sends nothing.
 *
 * Accepts POST /emails exactly as PynkPours calls Resend (Bearer key,
 * Idempotency-Key, inline attachments) and keeps every message in memory so
 * tests can read what a guest or the owner would have received.
 *
 *   GET  /__test/emails?to=<address>   messages sent to that address (oldest first)
 *   GET  /__test/health
 *
 *   npx tsx tests/support/resend-double.mts
 */
import { randomUUID } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";

const PORT = Number(process.env.RESEND_DOUBLE_PORT ?? 12113);

export interface CapturedEmail {
  id: string;
  idempotencyKey: string | null;
  from: string;
  to: string[];
  reply_to?: string[];
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: string; content_id?: string; content_type?: string }[];
}

const sent: CapturedEmail[] = [];
const byKey = new Map<string, string>();

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  if (url.pathname === "/__test/health") return json(res, 200, { ok: true, double: "resend" });
  if (req.method === "GET" && url.pathname === "/__test/emails") {
    const to = url.searchParams.get("to")?.toLowerCase();
    return json(res, 200, sent.filter((m) => !to || m.to.some((t) => t.toLowerCase() === to)));
  }
  if (req.method === "POST" && url.pathname === "/emails") {
    if (!/^Bearer re_\S+$/.test(req.headers.authorization ?? "")) return json(res, 401, { name: "missing_api_key", message: "Missing API key" });
    let body = "";
    for await (const c of req) body += c;
    let msg: Omit<CapturedEmail, "id" | "idempotencyKey">;
    try { msg = JSON.parse(body); } catch { return json(res, 422, { name: "validation_error", message: "Invalid JSON" }); }
    if (!msg.from || !msg.to?.length || !msg.subject || !msg.html) return json(res, 422, { name: "validation_error", message: "from, to, subject and html are required" });
    const key = (req.headers["idempotency-key"] as string | undefined) ?? null;
    // Same key again = same message (Resend de-duplicates retries for 24h).
    if (key && byKey.has(key)) return json(res, 200, { id: byKey.get(key) });
    const id = randomUUID();
    if (key) byKey.set(key, id);
    sent.push({ id, idempotencyKey: key, ...msg });
    return json(res, 200, { id });
  }
  json(res, 404, { name: "not_found", message: "Not found" });
}).listen(PORT, "127.0.0.1", () => console.log(`[resend-double] listening on http://127.0.0.1:${PORT} (LOCAL TEST DOUBLE, sends nothing)`));
