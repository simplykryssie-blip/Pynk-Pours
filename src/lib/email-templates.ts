/**
 * Transactional email content. Pure functions (no I/O) so they can be unit
 * tested. Every value that came from a guest or the database is HTML-escaped.
 * Layout uses simple inline styles that render in Gmail, Outlook and Apple Mail.
 */

export interface EmailContent { subject: string; html: string; text: string }

export interface EventFacts { title: string; date: string; time: string | null; where: string }

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const BRAND = "PynkPours";
const PINK = "#b0175f";

function shell(title: string, inner: string, footer: string) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f6f2ef;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f2ef;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;font-family:Arial,Helvetica,sans-serif;color:#1d1418;">
<tr><td style="background:#0b0b0b;border-radius:8px 8px 0 0;padding:20px 24px;color:#f7f1ed;font-family:Georgia,serif;font-size:22px;">${BRAND}</td></tr>
<tr><td style="padding:24px;">
<h1 style="margin:0 0 12px;font-family:Georgia,serif;font-size:24px;line-height:1.25;color:#1d1418;">${esc(title)}</h1>
${inner}
</td></tr>
<tr><td style="padding:16px 24px 24px;border-top:1px solid #eee;font-size:12px;line-height:1.5;color:#6b5a62;">${footer}</td></tr>
</table></td></tr></table></body></html>`;
}

function button(href: string, label: string) {
  return `<p style="margin:20px 0;"><a href="${esc(href)}" style="display:inline-block;background:${PINK};color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:6px;">${esc(label)}</a></p>`;
}

function eventBlock(e: EventFacts) {
  const rows = [e.date, e.time, e.where].filter(Boolean).map((r) => `<div>${esc(r as string)}</div>`).join("");
  return `<div style="margin:12px 0;padding:12px 14px;background:#faf6f8;border-radius:6px;font-size:15px;line-height:1.6;"><strong>${esc(e.title)}</strong>${rows}</div>`;
}

const footerText = (replyTo: string) =>
  `Questions? Reply to this email or write to ${esc(replyTo)}. ${BRAND}, Lake Charles, Louisiana. All events are 18+; bring a valid photo ID.`;

export interface OrderConfirmationInput {
  purchaserName: string;
  orderNumber: number;
  event: EventFacts;
  lines: { label: string; amount: string }[];
  total: string;
  free: boolean;
  orderUrl: string;
  replyTo: string;
}

export function orderConfirmationEmail(i: OrderConfirmationInput): EmailContent {
  const first = i.purchaserName.split(/\s+/)[0] || i.purchaserName;
  const title = i.free ? "You're registered!" : "Your tickets are confirmed";
  const lines = i.lines.map((l) => `<tr><td style="padding:4px 0;">${esc(l.label)}</td><td align="right" style="padding:4px 0;">${esc(l.amount)}</td></tr>`).join("");
  const inner = `<p style="margin:0 0 8px;font-size:15px;line-height:1.6;">Hi ${esc(first)}, thank you! Order #${i.orderNumber} is ${i.free ? "confirmed" : "paid"}.</p>
${eventBlock(i.event)}
<table role="presentation" width="100%" style="font-size:14px;border-collapse:collapse;">${lines}
<tr><td style="padding:8px 0;border-top:1px solid #eee;font-weight:bold;">Total</td><td align="right" style="padding:8px 0;border-top:1px solid #eee;font-weight:bold;">${esc(i.total)}</td></tr></table>
<p style="font-size:15px;line-height:1.6;">Each guest receives their own ticket by email, with a QR code to show at the door. All tickets are also on your order page:</p>
${button(i.orderUrl, "View your tickets")}
<p style="font-size:13px;color:#6b5a62;">Keep this link private: anyone with it can see your tickets.</p>`;
  const text = [
    `Hi ${first}, thank you! Order #${i.orderNumber} is ${i.free ? "confirmed" : "paid"}.`,
    "", i.event.title, i.event.date, i.event.time ?? "", i.event.where, "",
    ...i.lines.map((l) => `${l.label}: ${l.amount}`), `Total: ${i.total}`, "",
    `View your tickets: ${i.orderUrl}`, "Keep this link private.", "",
    `Questions? ${i.replyTo}`,
  ].filter((l, idx, a) => !(l === "" && a[idx - 1] === "")).join("\n");
  return { subject: `${title}: ${i.event.title} (order #${i.orderNumber})`, html: shell(title, inner, footerText(i.replyTo)), text };
}

export interface TicketEmailInput {
  attendeeName: string;
  ticketType: string;
  manualCode: string;
  event: EventFacts;
  orderUrl: string;
  /** Content-ID of the attached QR PNG. */
  qrCid: string;
  replyTo: string;
  resend?: boolean;
}

export function ticketEmail(i: TicketEmailInput): EmailContent {
  const title = i.resend ? "Your ticket (resent)" : "Your ticket";
  const code = `${i.manualCode.slice(0, 4)}-${i.manualCode.slice(4)}`;
  const inner = `<p style="margin:0 0 8px;font-size:15px;line-height:1.6;">${esc(i.attendeeName)}, here is your ticket. Show the QR code at the door.</p>
${eventBlock(i.event)}
<p style="margin:16px 0 4px;font-size:14px;color:#6b5a62;">${esc(i.ticketType)}</p>
<p style="margin:0;text-align:center;"><img src="cid:${esc(i.qrCid)}" width="240" height="240" alt="Ticket QR code for ${esc(i.attendeeName)}" style="display:inline-block;border:8px solid #ffffff;"></p>
<p style="margin:8px 0 0;text-align:center;font-size:14px;">Backup code: <strong style="font-family:Courier,monospace;letter-spacing:2px;">${esc(code)}</strong></p>
${button(i.orderUrl, "Open ticket online")}
<p style="font-size:13px;color:#6b5a62;">This ticket admits one guest and can be used once. Don't share it publicly.</p>`;
  const text = [
    `${i.attendeeName}, here is your ticket for ${i.event.title}.`,
    i.event.date, i.event.time ?? "", i.event.where, "",
    `${i.ticketType}. Backup code: ${code}`,
    `The QR code is attached. You can also open it online: ${i.orderUrl}`, "",
    "This ticket admits one guest and can be used once.", `Questions? ${i.replyTo}`,
  ].join("\n");
  return { subject: `${title}: ${i.event.title}`, html: shell(title, inner, footerText(i.replyTo)), text };
}

export interface ContactNotificationInput {
  name: string;
  email: string;
  topic: string;
  subject: string | null;
  message: string;
  inboxUrl: string;
}

export function contactNotificationEmail(i: ContactNotificationInput): EmailContent {
  const title = `New ${i.topic} message from ${i.name}`;
  const inner = `<p style="font-size:14px;margin:0 0 4px;"><strong>From:</strong> ${esc(i.name)} &lt;${esc(i.email)}&gt;</p>
${i.subject ? `<p style="font-size:14px;margin:0 0 4px;"><strong>Subject:</strong> ${esc(i.subject)}</p>` : ""}
<div style="margin:12px 0;padding:12px 14px;background:#faf6f8;border-radius:6px;font-size:15px;line-height:1.6;white-space:pre-wrap;">${esc(i.message)}</div>
<p style="font-size:14px;">Reply to this email to answer ${esc(i.name)} directly.</p>
${button(i.inboxUrl, "Open the inbox")}`;
  const text = [`From: ${i.name} <${i.email}>`, i.subject ? `Subject: ${i.subject}` : "", "", i.message, "", `Inbox: ${i.inboxUrl}`].join("\n");
  return { subject: `${BRAND}: ${title}`, html: shell(title, inner, "Sent by the contact form on pynkpours.com."), text };
}

export interface ContactReplyInput {
  name: string;
  subject: string | null;
  reply: string;
  originalMessage: string;
  sentAt: string;
  replyTo: string;
}

/** A reply written in the dashboard Inbox, with the guest's original message quoted below. */
export function contactReplyEmail(i: ContactReplyInput): EmailContent {
  const first = i.name.split(/\s+/)[0] || i.name;
  const subject = `Re: ${i.subject?.trim() || "Your message to PynkPours"}`;
  const inner = `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Hi ${esc(first)},</p>
<div style="font-size:15px;line-height:1.6;white-space:pre-wrap;">${esc(i.reply)}</div>
<p style="margin:16px 0 0;font-size:15px;line-height:1.6;">PynkPours</p>
<div style="margin:20px 0 0;padding:10px 14px;border-left:3px solid #e6d6dd;color:#6b5a62;font-size:13px;line-height:1.5;">
<div style="margin-bottom:4px;">On ${esc(i.sentAt)}, you wrote:</div>
<div style="white-space:pre-wrap;">${esc(i.originalMessage)}</div></div>`;
  const quoted = i.originalMessage.split("\n").map((l) => `> ${l}`).join("\n");
  const text = [`Hi ${first},`, "", i.reply, "", "PynkPours", "", `On ${i.sentAt}, you wrote:`, quoted].join("\n");
  return { subject, html: shell(subject, inner, footerText(i.replyTo)), text };
}

// ---------------------------------------------------------------- forms
export interface FormAnswerLine { label: string; value: string }

function answersBlock(lines: FormAnswerLine[]) {
  return `<table role="presentation" width="100%" style="font-size:14px;border-collapse:collapse;margin:12px 0;">${lines
    .map((l) => `<tr><td style="padding:6px 0;border-top:1px solid #eee;vertical-align:top;color:#6b5a62;width:40%;">${esc(l.label)}</td><td style="padding:6px 0 6px 12px;border-top:1px solid #eee;white-space:pre-wrap;">${esc(l.value || "—")}</td></tr>`)
    .join("")}</table>`;
}
const answersText = (lines: FormAnswerLine[]) => lines.map((l) => `${l.label}: ${l.value || "—"}`).join("\n");

/** To the applicant, right after they submit. */
export function formReceiptEmail(i: { formTitle: string; name: string | null; statusUrl: string; message: string; answers: FormAnswerLine[]; replyTo: string }): EmailContent {
  const title = `We received your ${i.formTitle}`;
  const hello = i.name ? `Hi ${esc(i.name.split(/\s+/)[0])},` : "Hi,";
  const inner = `<p style="margin:0 0 8px;font-size:15px;line-height:1.6;">${hello} thank you! We've received your response and will be in touch.</p>
${i.message ? `<p style="font-size:15px;line-height:1.6;white-space:pre-wrap;">${esc(i.message)}</p>` : ""}
<p style="font-size:15px;line-height:1.6;">You can check its status any time:</p>
${button(i.statusUrl, "Check status")}
<p style="font-size:13px;color:#6b5a62;">Keep this link private. A copy of what you sent:</p>
${answersBlock(i.answers)}`;
  const text = [i.name ? `Hi ${i.name.split(/\s+/)[0]},` : "Hi,", "", "Thank you! We've received your response and will be in touch.",
    i.message, "", `Check status: ${i.statusUrl}`, "", "What you sent:", answersText(i.answers), "", `Questions? ${i.replyTo}`].join("\n");
  return { subject: title, html: shell(title, inner, footerText(i.replyTo)), text };
}

/** To the PynkPours inbox, for each new response. */
export function formNotificationEmail(i: { formTitle: string; name: string | null; email: string; reviewUrl: string; answers: FormAnswerLine[]; fileCount: number }): EmailContent {
  const who = i.name ?? i.email;
  const title = `New ${i.formTitle} response from ${who}`;
  const inner = `<p style="font-size:14px;margin:0 0 4px;"><strong>From:</strong> ${esc(who)} &lt;${esc(i.email)}&gt;</p>
${answersBlock(i.answers)}
${i.fileCount ? `<p style="font-size:14px;">${i.fileCount} file${i.fileCount > 1 ? "s" : ""} attached in the dashboard.</p>` : ""}
${button(i.reviewUrl, "Review in the dashboard")}`;
  const text = [`From: ${who} <${i.email}>`, "", answersText(i.answers), "", `Review: ${i.reviewUrl}`].join("\n");
  return { subject: `PynkPours: ${title}`, html: shell(title, inner, "Sent by a form on pynkpours.com. Reply to answer the applicant directly."), text };
}

const STATUS_COPY: Record<string, { title: string; line: string }> = {
  approved: { title: "Good news about your", line: "We're happy to let you know your response has been approved." },
  declined: { title: "An update on your", line: "Thank you for your interest. Unfortunately we aren't able to move forward this time." },
  waitlisted: { title: "You're on the waitlist for your", line: "We've added you to our waitlist and will be in touch if a spot opens up." },
  reviewing: { title: "We're reviewing your", line: "We're reviewing your response and will be in touch soon." },
  new: { title: "An update on your", line: "There's an update on your response." },
};

/** To the applicant, when staff change the status and choose to notify them. */
export function formStatusEmail(i: { formTitle: string; name: string | null; status: string; message: string; statusUrl: string; replyTo: string }): EmailContent {
  const copy = STATUS_COPY[i.status] ?? STATUS_COPY.new;
  const title = `${copy.title} ${i.formTitle}`;
  const hello = i.name ? `Hi ${esc(i.name.split(/\s+/)[0])},` : "Hi,";
  const inner = `<p style="margin:0 0 8px;font-size:15px;line-height:1.6;">${hello}</p>
<p style="font-size:15px;line-height:1.6;">${esc(copy.line)}</p>
${i.message ? `<div style="margin:12px 0;padding:12px 14px;background:#faf6f8;border-radius:6px;font-size:15px;line-height:1.6;white-space:pre-wrap;">${esc(i.message)}</div>` : ""}
${button(i.statusUrl, "View status")}`;
  const text = [i.name ? `Hi ${i.name.split(/\s+/)[0]},` : "Hi,", "", copy.line, "", i.message, "", `View status: ${i.statusUrl}`, "", `Questions? ${i.replyTo}`].join("\n");
  return { subject: title, html: shell(title, inner, footerText(i.replyTo)), text };
}
