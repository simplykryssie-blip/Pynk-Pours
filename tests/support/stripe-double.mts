/**
 * LOCAL STRIPE TEST DOUBLE — for automated tests only. NOT Stripe.
 *
 * Implements just the Stripe API calls PynkPours makes, plus a stand-in hosted
 * payment page that follows Stripe's documented TEST-CARD behaviour:
 *   4242 4242 4242 4242  -> payment succeeds
 *   4000 0000 0000 0002  -> card declined (generic_decline)
 * Webhooks are delivered with genuine Stripe signatures (the official SDK's
 * generateTestHeaderString) to PynkPours' real /api/stripe/webhook endpoint.
 *
 * Test controls (/__test/*) can re-deliver an event (duplicate delivery),
 * simulate a refund made in the Stripe dashboard, and list events.
 *
 *   npx tsx --env-file=.env.local tests/support/stripe-double.mts
 */
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import Stripe from "stripe";

const PORT = Number(process.env.STRIPE_DOUBLE_PORT ?? 12111);
const WEBHOOK_URL = process.env.STRIPE_DOUBLE_WEBHOOK_URL ?? "http://localhost:3123/api/stripe/webhook";
const SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
if (!SECRET.startsWith("whsec_")) throw new Error("STRIPE_WEBHOOK_SECRET required");

type Obj = Record<string, unknown>;
const sessions = new Map<string, Obj>();
const refunds = new Map<string, Obj>();
const events = new Map<string, Obj>();
const idempotent = new Map<string, string>();
const id = (p: string) => `${p}_${randomBytes(12).toString("hex")}`;
const now = () => Math.floor(Date.now() / 1000);

/** Parse Stripe's form encoding: a[b][0][c]=v -> { a: { b: [ { c: v } ] } } */
function parseForm(body: string): Obj {
  const out: Obj = {};
  for (const [rawKey, value] of new URLSearchParams(body)) {
    const keys = rawKey.replace(/\]/g, "").split("[");
    let cur: Obj | unknown[] = out;
    keys.forEach((k, i) => {
      const last = i === keys.length - 1;
      const nextIsIndex = !last && /^\d+$/.test(keys[i + 1]);
      const container = cur as Record<string, unknown>;
      if (last) container[k] = value;
      else {
        container[k] ??= nextIsIndex ? [] : {};
        cur = container[k] as Obj;
      }
    });
  }
  return out;
}

async function readBody(req: IncomingMessage) {
  let b = "";
  for await (const c of req) b += c;
  return b;
}
function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}
const stripeError = (res: ServerResponse, status: number, message: string, code?: string) =>
  json(res, status, { error: { type: "invalid_request_error", message, code } });

async function deliver(evt: Obj) {
  const payload = JSON.stringify(evt);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  try {
    const r = await fetch(WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json", "Stripe-Signature": header }, body: payload });
    return { status: r.status, body: await r.text() };
  } catch (e) {
    return { status: 0, body: String(e) };
  }
}

function emit(type: string, object: Obj) {
  const evt = { id: id("evt"), object: "event", api_version: "2026-10-28.endive", created: now(), livemode: false, pending_webhooks: 1, type, data: { object } };
  events.set(evt.id as string, evt);
  setTimeout(() => void deliver(evt), 150);
  return evt;
}

function sessionTotal(s: Obj) {
  return (s.line_items as { quantity: string; price_data: { unit_amount: string } }[]).reduce((a, li) => a + Number(li.quantity) * Number(li.price_data.unit_amount), 0);
}

function payPage(s: Obj, message?: string) {
  const total = (Number(s.amount_total) / 100).toFixed(2);
  const lines = (s.line_items as { quantity: string; price_data: { product_data: { name: string } } }[])
    .map((li) => `<li>${li.quantity} × ${li.price_data.product_data.name}</li>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>LOCAL TEST DOUBLE — not Stripe</title>
<style>body{font:16px system-ui;margin:0;background:#f6f9fc;color:#1a1a1a}.bar{background:#b3261e;color:#fff;padding:10px;text-align:center;font-weight:700}
main{max-width:420px;margin:30px auto;background:#fff;padding:24px;border-radius:8px;box-shadow:0 2px 8px #0002}input{width:100%;padding:10px;font:inherit;margin:6px 0 14px;box-sizing:border-box}
button{width:100%;padding:12px;background:#635bff;color:#fff;border:0;border-radius:6px;font:600 16px system-ui}.err{color:#b3261e;font-weight:600}</style></head>
<body><div class="bar">LOCAL STRIPE TEST DOUBLE — automated testing only, NOT Stripe</div><main>
<h1 style="font-size:20px">Pay $${total}</h1><ul>${lines}</ul><p style="font-size:13px">${s.customer_email ?? ""}</p>
${message ? `<p class="err" role="alert">${message}</p>` : ""}
<form method="post"><label>Card number<input name="card" inputmode="numeric" autocomplete="off" placeholder="4242 4242 4242 4242"></label>
<label>Expiry<input name="exp" placeholder="12 / 34"></label><label>CVC<input name="cvc" placeholder="123"></label>
<button type="submit">Pay $${total}</button></form><p><a href="${s.cancel_url}">← Back</a></p></main></body></html>`;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  const body = req.method === "POST" ? await readBody(req) : "";
  const idem = req.headers["idempotency-key"];
  const idemKey = typeof idem === "string" ? `${path}:${idem}` : null;
  if (idemKey && idempotent.has(idemKey)) {
    res.writeHead(200, { "Content-Type": "application/json", "Idempotent-Replayed": "true" });
    return res.end(idempotent.get(idemKey));
  }
  const ok = (obj: unknown) => {
    const s = JSON.stringify(obj);
    if (idemKey) idempotent.set(idemKey, s);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(s);
  };

  // ---- Stripe API surface used by PynkPours
  if (req.method === "POST" && path === "/v1/checkout/sessions") {
    const p = parseForm(body);
    const sid = id("cs_test");
    const s: Obj = {
      id: sid, object: "checkout.session", mode: p.mode, status: "open", payment_status: "unpaid", livemode: false,
      currency: (p.line_items as { price_data: { currency: string } }[])[0].price_data.currency,
      customer_email: p.customer_email, client_reference_id: p.client_reference_id, metadata: p.metadata ?? {},
      success_url: p.success_url, cancel_url: p.cancel_url, expires_at: Number(p.expires_at), payment_intent: null,
      line_items: p.line_items, payment_intent_metadata: (p.payment_intent_data as Obj | undefined)?.metadata ?? {},
      url: `http://127.0.0.1:${PORT}/pay/${sid}`,
    };
    s.amount_total = sessionTotal(s);
    sessions.set(sid, s);
    const { line_items: _li, payment_intent_metadata: _m, ...publicView } = s;
    void _li; void _m;
    return ok(publicView);
  }
  let m = /^\/v1\/checkout\/sessions\/([^/]+)$/.exec(path);
  if (req.method === "GET" && m) {
    const s = sessions.get(m[1]);
    if (!s) return stripeError(res, 404, "No such checkout.session", "resource_missing");
    const { line_items: _li, payment_intent_metadata: _m, ...v } = s;
    void _li; void _m;
    return ok(v);
  }
  m = /^\/v1\/checkout\/sessions\/([^/]+)\/expire$/.exec(path);
  if (req.method === "POST" && m) {
    const s = sessions.get(m[1]);
    if (!s) return stripeError(res, 404, "No such checkout.session", "resource_missing");
    if (s.status !== "open") return stripeError(res, 400, `Only open sessions can be expired (status: ${s.status})`);
    s.status = "expired";
    const { line_items: _li, payment_intent_metadata: _m, ...v } = s;
    void _li; void _m;
    emit("checkout.session.expired", v);
    return ok(v);
  }
  if (req.method === "POST" && path === "/v1/refunds") {
    const p = parseForm(body);
    const pi = String(p.payment_intent);
    const sess = [...sessions.values()].find((s) => s.payment_intent === pi);
    if (!sess) return stripeError(res, 400, "No such payment_intent", "resource_missing");
    const already = [...refunds.values()].filter((r) => r.payment_intent === pi).reduce((a, r) => a + Number(r.amount), 0);
    const amount = Number(p.amount ?? Number(sess.amount_total) - already);
    if (already + amount > Number(sess.amount_total)) return stripeError(res, 400, "Refund exceeds charge", "charge_already_refunded");
    const r: Obj = { id: id("re"), object: "refund", amount, currency: sess.currency, payment_intent: pi, status: "succeeded", reason: p.reason ?? null, metadata: p.metadata ?? {}, created: now() };
    refunds.set(r.id as string, r);
    emit("charge.refunded", { id: id("ch"), object: "charge", payment_intent: pi, amount: sess.amount_total, amount_refunded: already + amount, refunded: already + amount === sess.amount_total });
    return ok(r);
  }
  if (req.method === "GET" && path === "/v1/refunds") {
    const pi = url.searchParams.get("payment_intent");
    return ok({ object: "list", has_more: false, url: "/v1/refunds", data: [...refunds.values()].filter((r) => r.payment_intent === pi) });
  }

  // ---- Stand-in hosted payment page (test-card semantics)
  m = /^\/pay\/([^/]+)$/.exec(path);
  if (m) {
    const s = sessions.get(m[1]);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (!s) return res.writeHead(404).end("Unknown session");
    if (s.status === "expired") return res.end(`<!doctype html><title>Expired</title><div style="font:16px system-ui;padding:40px"><p role="alert">This checkout session has expired.</p><a href="${s.cancel_url}">Return to site</a></div>`);
    if (s.status === "complete") { res.writeHead(303, { Location: String(s.success_url).replace("{CHECKOUT_SESSION_ID}", String(s.id)) }); return res.end(); }
    if (req.method === "GET") return res.end(payPage(s));
    const card = (new URLSearchParams(body).get("card") ?? "").replace(/\s/g, "");
    if (card === "4000000000000002") {
      emit("payment_intent.payment_failed", { id: id("pi"), object: "payment_intent", status: "requires_payment_method", metadata: s.payment_intent_metadata, last_payment_error: { code: "card_declined", decline_code: "generic_decline" } });
      return res.end(payPage(s, "Your card was declined."));
    }
    if (card !== "4242424242424242") return res.end(payPage(s, "Your card number is invalid."));
    s.status = "complete";
    s.payment_status = "paid";
    s.payment_intent = id("pi");
    const { line_items: _li, payment_intent_metadata: _m, ...v } = s;
    void _li; void _m;
    emit("checkout.session.completed", v);
    res.writeHead(303, { Location: String(s.success_url).replace("{CHECKOUT_SESSION_ID}", String(s.id)) });
    return res.end();
  }

  // ---- Test controls
  m = /^\/__test\/redeliver\/([^/]+)$/.exec(path);
  if (req.method === "POST" && m) {
    const evt = events.get(m[1]);
    if (!evt) return json(res, 404, { error: "unknown event" });
    const times = Number(url.searchParams.get("times") ?? 1);
    const results = await Promise.all(Array.from({ length: times }, () => deliver(evt)));
    return json(res, 200, { results });
  }
  if (req.method === "GET" && path === "/__test/events") {
    return json(res, 200, [...events.values()].map((e) => ({ id: e.id, type: e.type, object: (e.data as { object: Obj }).object })));
  }
  if (req.method === "POST" && path === "/__test/dashboard-refund") {
    const p = JSON.parse(body) as { payment_intent: string; amount: number };
    const sess = [...sessions.values()].find((s) => s.payment_intent === p.payment_intent);
    if (!sess) return json(res, 404, { error: "unknown payment_intent" });
    const r: Obj = { id: id("re"), object: "refund", amount: p.amount, currency: sess.currency, payment_intent: p.payment_intent, status: "succeeded", reason: null, metadata: {}, created: now() };
    refunds.set(r.id as string, r);
    const evt = emit("charge.refunded", { id: id("ch"), object: "charge", payment_intent: p.payment_intent });
    return json(res, 200, { refund: r, event_id: evt.id });
  }
  if (path === "/__test/health") return json(res, 200, { ok: true });
  return stripeError(res, 404, `Unrecognized request URL (${req.method}: ${path})`);
});

server.listen(PORT, "127.0.0.1", () => console.log(`Stripe test double on http://127.0.0.1:${PORT} → webhooks to ${WEBHOOK_URL}`));
