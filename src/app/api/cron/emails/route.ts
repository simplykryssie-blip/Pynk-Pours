import { connection } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { processOutbox } from "@/server/email/outbox";

/**
 * Retries queued or failed transactional emails. Called by Vercel Cron (see
 * vercel.json), which sends "Authorization: Bearer <CRON_SECRET>". Emails are
 * normally sent immediately after checkout; this is the safety net.
 */
export async function GET(req: Request) {
  await connection();
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return new Response("Unauthorized", { status: 401 });
  }
  let total = { claimed: 0, sent: 0, failed: 0 };
  for (let i = 0; i < 5; i++) {
    const r = await processOutbox(25);
    total = { claimed: total.claimed + r.claimed, sent: total.sent + r.sent, failed: total.failed + r.failed };
    if (r.claimed < 25) break;
  }
  return Response.json(total);
}
