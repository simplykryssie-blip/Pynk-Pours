import "server-only";

/**
 * Minimal Resend client (REST, no SDK). RESEND_API_BASE is a LOCAL TEST override
 * (a test double on localhost) and is ignored in production unless
 * PYNKPOURS_LOCAL_TEST=true, exactly like STRIPE_API_BASE.
 */
export interface OutgoingEmail {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: Buffer; contentId?: string; contentType?: string }[];
  /** Resend de-duplicates retries with the same key for 24h. */
  idempotencyKey: string;
}

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

function apiBase(): string {
  const override = process.env.RESEND_API_BASE;
  const allowOverride = process.env.NODE_ENV !== "production" || process.env.PYNKPOURS_LOCAL_TEST === "true";
  if (override && allowOverride && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(override)) return override;
  return "https://api.resend.com";
}

export async function sendEmail(e: OutgoingEmail): Promise<{ id: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  const res = await fetch(`${apiBase()}/emails`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "Idempotency-Key": e.idempotencyKey.slice(0, 256),
    },
    body: JSON.stringify({
      from: e.from,
      to: [e.to],
      reply_to: e.replyTo ? [e.replyTo] : undefined,
      subject: e.subject,
      html: e.html,
      text: e.text,
      attachments: e.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content.toString("base64"),
        content_id: a.contentId,
        content_type: a.contentType,
      })),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
  if (!res.ok || !body.id) throw new Error(`Resend ${res.status}: ${body.message ?? body.name ?? "unknown error"}`);
  return { id: body.id };
}
