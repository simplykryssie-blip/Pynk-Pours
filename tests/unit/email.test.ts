import jsQR from "jsqr";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { contactNotificationEmail, orderConfirmationEmail, ticketEmail } from "@/lib/email-templates";
import { generateCredential } from "@/server/credentials";
import { qrPng, qrSvg } from "@/server/qr";
import { sendEmail } from "@/server/email/resend";

const event = { title: "Sample <Mixer>", date: "Sat, Mar 21, 2026", time: "7:00 PM CDT", where: "Sample Venue, Lake Charles" };

describe("email templates", () => {
  it("order confirmation: escapes guest input, lists lines and links to the order", () => {
    const e = orderConfirmationEmail({
      purchaserName: "<script>alert(1)</script> Smith", orderNumber: 1042, event,
      lines: [{ label: "2 × General", amount: "$50.00" }], total: "$50.00", free: false,
      orderUrl: "https://pynkpours.com/orders/abc", replyTo: "hello@pynkpours.com",
    });
    expect(e.subject).toBe("Your tickets are confirmed: Sample <Mixer> (order #1042)");
    expect(e.html).not.toContain("<script>");
    expect(e.html).toContain("&lt;script&gt;");
    expect(e.html).toContain("Sample &lt;Mixer&gt;");
    expect(e.html).toContain('href="https://pynkpours.com/orders/abc"');
    expect(e.text).toContain("2 × General: $50.00");
    expect(e.text).toContain("View your tickets: https://pynkpours.com/orders/abc");
    expect(e.html).toContain("18+");
  });

  it("free registration wording", () => {
    const e = orderConfirmationEmail({ purchaserName: "Ana", orderNumber: 7, event, lines: [], total: "$0.00", free: true, orderUrl: "https://x/o", replyTo: "r@x" });
    expect(e.subject).toMatch(/^You're registered!/);
    expect(e.text).toContain("Order #7 is confirmed");
  });

  it("ticket: inline QR by content id, formatted backup code, resend wording", () => {
    const e = ticketEmail({ attendeeName: "Ana B", ticketType: "VIP", manualCode: "ABCD2345", event, orderUrl: "https://x/o#ticket-ABCD2345", qrCid: "ticket-1", replyTo: "r@x", resend: true });
    expect(e.html).toContain('src="cid:ticket-1"');
    expect(e.html).toContain("ABCD-2345");
    expect(e.subject).toBe("Your ticket (resent): Sample <Mixer>");
    expect(e.text).toContain("Backup code: ABCD-2345");
  });

  it("contact notification escapes the message", () => {
    const e = contactNotificationEmail({ name: "Bo", email: "bo@example.test", topic: "general", subject: null, message: "<b>hi</b>", inboxUrl: "https://admin.pynkpours.com/admin/inbox" });
    expect(e.html).toContain("&lt;b&gt;hi&lt;/b&gt;");
    expect(e.html).not.toContain("Subject:");
    expect(e.subject).toBe("PynkPours: New general message from Bo");
  });
});

describe("ticket QR codes", () => {
  it("PNG decodes back to the exact credential", async () => {
    const credential = generateCredential();
    const { data, info } = await sharp(await qrPng(credential)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data).toBe(credential);
  });
  it("SVG is a standalone image", async () => {
    const svg = await qrSvg(generateCredential());
    expect(svg).toMatch(/^<svg[\s\S]*<\/svg>\s*$/);
  });
});

describe("Resend client", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  const msg = { from: "PynkPours <hello@pynkpours.com>", to: "a@example.test", subject: "s", html: "<p>h</p>", text: "h", idempotencyKey: "pynkpours:ticket:1",
    attachments: [{ filename: "t.png", content: Buffer.from("png"), contentId: "ticket-1", contentType: "image/png" }] };

  function capture() {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: "msg_1" }), { status: 200 });
    }));
    return calls;
  }

  it("posts to api.resend.com with the idempotency key and base64 inline attachment", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_x");
    const calls = capture();
    await expect(sendEmail(msg)).resolves.toEqual({ id: "msg_1" });
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    const h = calls[0].init.headers as Record<string, string>;
    expect(h["Idempotency-Key"]).toBe("pynkpours:ticket:1");
    expect(h.Authorization).toBe("Bearer re_x");
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.attachments[0]).toEqual({ filename: "t.png", content: Buffer.from("png").toString("base64"), content_id: "ticket-1", content_type: "image/png" });
  });

  it("ignores a RESEND_API_BASE override in production, and any non-localhost override", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_x");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PYNKPOURS_LOCAL_TEST", "");
    vi.stubEnv("RESEND_API_BASE", "http://127.0.0.1:12113");
    let calls = capture();
    await sendEmail(msg);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("RESEND_API_BASE", "https://evil.example.com");
    calls = capture();
    await sendEmail(msg);
    expect(calls[0].url).toBe("https://api.resend.com/emails");
  });

  it("raises on a provider error so the outbox retries", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_x");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ name: "validation_error", message: "bad from" }), { status: 422 })));
    await expect(sendEmail(msg)).rejects.toThrow("Resend 422: bad from");
  });
});

describe("contact reply email", () => {
  it("quotes the original, escapes both, and uses Re: subject", async () => {
    const { contactReplyEmail } = await import("@/lib/email-templates");
    const e = contactReplyEmail({ name: "Bo Lee", subject: "Tables?", reply: "Yes <b>we</b> do.", originalMessage: "Do you sell <tables>?", sentAt: "November 1, 2026", replyTo: "hello@pynkpours.com" });
    expect(e.subject).toBe("Re: Tables?");
    expect(e.html).toContain("Yes &lt;b&gt;we&lt;/b&gt; do.");
    expect(e.html).toContain("Do you sell &lt;tables&gt;?");
    expect(e.text).toContain("Hi Bo,");
    expect(e.text).toContain("> Do you sell <tables>?");
  });
});
