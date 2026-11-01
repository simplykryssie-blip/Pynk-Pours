import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { OrderPoller } from "@/components/checkout/OrderPoller";
import { PendingOrderActions } from "@/components/checkout/OrderActions";
import { eventWhen, eventWhere } from "@/components/events/format";
import { CalendarIcon, CheckIcon } from "@/components/ui/icons";
import { Badge, Container, Eyebrow, LinkButton } from "@/components/ui/primitives";
import { formatEventTime } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { decryptCredential, hashCredential } from "@/server/credentials";
import { qrSvg } from "@/server/qr";
import { isOrderToken } from "@/server/checkout/tokens";
import { serviceDb } from "@/server/supabase";

export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } };

export default function OrderPage(props: PageProps<"/orders/[token]">) {
  return (
    <Suspense fallback={<Container className="py-20"><p role="status" className="text-pp-cream">Loading your order…</p></Container>}>
      <Order {...props} />
    </Suspense>
  );
}

type Tkt = { manual_code: string; status: string; checked_in_at: string | null; credential_ciphertext: string };
type Att = { position: number; full_name: string; email: string; ticket_types: { name: string } | null; tickets: Tkt | Tkt[] | null };

/**
 * The guest's private order page (no login): access is by the unguessable token
 * in the link. Status comes ONLY from the database, which is updated only by
 * verified Stripe webhooks — returning from Stripe is never treated as payment.
 */
async function Order({ params, searchParams }: PageProps<"/orders/[token]">) {
  const [{ token }, sp] = await Promise.all([params, searchParams]);
  if (!isOrderToken(token)) notFound();
  const { data: o } = await serviceDb()
    .from("orders")
    .select("id, order_number, status, total_cents, amount_refunded_cents, currency, purchaser_name, purchaser_email, expires_at, needs_review, events(title, slug, starts_at, ends_at, timezone, is_online, venue_name), order_items(ticket_type_name, quantity, unit_price_cents, admits_per_unit), attendees(position, full_name, email, ticket_types(name), tickets(manual_code, status, checked_in_at, credential_ciphertext))")
    .eq("public_token_hash", hashCredential(token))
    .maybeSingle();
  if (!o) notFound();
  const ev = o.events as unknown as { title: string; slug: string; starts_at: string | null; ends_at: string | null; timezone: string | null; is_online: boolean; venue_name: string | null };
  const when = eventWhen(ev);
  const attendees = ((o.attendees ?? []) as unknown as Att[]).sort((a, b) => a.position - b.position);
  const items = o.order_items as { ticket_type_name: string; quantity: number; unit_price_cents: number; admits_per_unit: number }[];
  const tz = ev.timezone ?? "America/Chicago";
  // QR per valid ticket: the credential is decrypted on the server only; the page gets an SVG.
  const qrs = new Map<string, string>();
  const key = process.env.TICKET_CREDENTIAL_KEY;
  if (key && o.status !== "refunded") {
    await Promise.all(attendees.map(async (a) => {
      const t = Array.isArray(a.tickets) ? a.tickets[0] : a.tickets;
      if (!t || t.status !== "valid") return;
      try {
        qrs.set(t.manual_code, await qrSvg(decryptCredential(t.credential_ciphertext, key)));
      } catch (e) {
        console.error(`[order] QR for ticket ${t.manual_code} unavailable: ${(e as Error).message}`);
      }
    }));
  }

  const summary = (
    <div className="space-y-2 border-t border-white/10 pt-4 text-sm text-pp-cream/85">
      {items.map((it, i) => <p key={i} className="flex justify-between"><span>{it.quantity} × {it.ticket_type_name}</span><span>{formatMoney(it.unit_price_cents * it.quantity, o.currency)}</span></p>)}
      <p className="flex justify-between font-semibold text-pp-cream"><span>Total</span><span>{formatMoney(o.total_cents, o.currency)}</span></p>
      {o.amount_refunded_cents > 0 && <p className="flex justify-between text-[#ffb4ab]"><span>Refunded</span><span>−{formatMoney(o.amount_refunded_cents, o.currency)}</span></p>}
    </div>
  );

  let body: React.ReactNode;
  if (o.status === "pending" && sp.cancelled) {
    body = (
      <>
        <Eyebrow>Checkout not finished</Eyebrow>
        <h1 className="font-serif text-4xl text-pp-cream">You left the payment page.</h1>
        <p className="text-pp-cream/80">Your tickets are held until <strong>{formatEventTime(o.expires_at, tz)}</strong>. Nothing has been charged.</p>
        <PendingOrderActions token={token} />
      </>
    );
  } else if (o.status === "pending") {
    body = (
      <>
        <Eyebrow>Almost there</Eyebrow>
        <h1 className="font-serif text-4xl text-pp-cream">Confirming your payment…</h1>
        <p className="text-pp-cream/80">We&apos;re waiting for Stripe to confirm your payment. Your tickets are issued the moment it&apos;s confirmed.</p>
        <OrderPoller />
        <details className="text-sm text-pp-cream/70"><summary className="cursor-pointer">Didn&apos;t finish paying?</summary><div className="mt-3"><PendingOrderActions token={token} /></div></details>
      </>
    );
  } else if (o.status === "cancelled" || o.status === "failed") {
    body = (
      <>
        <Eyebrow>Order not completed</Eyebrow>
        <h1 className="font-serif text-4xl text-pp-cream">{o.status === "failed" ? "Payment was not completed." : "This order was cancelled."}</h1>
        <p className="text-pp-cream/80">No tickets were issued and the seats have been released. If you were charged, please contact us with order #{o.order_number}.</p>
        <LinkButton href={`/events/${ev.slug}`}>Back to the event</LinkButton>
      </>
    );
  } else if (o.needs_review && attendees.every((a) => !a.tickets || (Array.isArray(a.tickets) && a.tickets.length === 0))) {
    body = (
      <>
        <Eyebrow>Payment received</Eyebrow>
        <h1 className="font-serif text-4xl text-pp-cream">We&apos;re finalising your order.</h1>
        <p className="text-pp-cream/80">Your payment arrived, but our team needs to review this order before tickets are issued. We&apos;ll contact you at {o.purchaser_email}.</p>
      </>
    );
  } else {
    body = (
      <>
        <CheckIcon width={48} height={48} className="text-pp-pink" />
        <Eyebrow>Order #{o.order_number}</Eyebrow>
        <h1 className="font-serif text-4xl text-pp-cream">{o.status === "refunded" ? "This order was refunded." : "You're registered!"}</h1>
        <p className="text-pp-cream/80">We&apos;ve emailed your confirmation to {o.purchaser_email}, and each guest gets their own ticket by email. Every ticket&apos;s QR code is also below. Keep this page private.</p>
        <ul className="space-y-3">
          {attendees.map((a) => {
            const t = Array.isArray(a.tickets) ? a.tickets[0] : a.tickets;
            return (
              <li key={a.position} id={t ? `ticket-${t.manual_code}` : undefined} className="space-y-4 border border-white/15 p-4" data-testid="ticket">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-pp-cream">{a.full_name}</p>
                    <p className="text-sm text-pp-cream/70">{a.ticket_types?.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {t && <code className="rounded-sm bg-white/10 px-2 py-1 font-mono text-pp-cream">{t.manual_code}</code>}
                    {t && t.status !== "valid" && <Badge tone="pink">{t.status}</Badge>}
                    {t?.checked_in_at && <Badge tone="muted">Checked in</Badge>}
                  </div>
                </div>
                {t && qrs.get(t.manual_code) && (
                  <figure className="mx-auto w-full max-w-[240px]">
                    {/* SVG produced by the qrcode library from server data only. */}
                    <div role="img" aria-label={`Ticket QR code for ${a.full_name}`} data-testid="ticket-qr"
                      className="rounded-sm bg-white p-2 [&_svg]:h-auto [&_svg]:w-full"
                      dangerouslySetInnerHTML={{ __html: qrs.get(t.manual_code)! }} />
                    <figcaption className="mt-2 text-center text-xs text-pp-cream/70">Show this at the door. Turn your screen brightness up.</figcaption>
                  </figure>
                )}
              </li>
            );
          })}
        </ul>
        {ev.starts_at && o.status !== "refunded" && (
          <a href={`/events/${ev.slug}/calendar`} className="inline-flex items-center gap-2 text-xs font-bold tracking-[0.15em] text-pp-gold uppercase hover:underline"><CalendarIcon width={16} height={16} /> Add to calendar</a>
        )}
      </>
    );
  }

  return (
    <section className="bg-pp-black">
      <Container className="max-w-2xl space-y-6 py-14">
        <p className="text-sm text-pp-cream/70">{ev.title} · {when.date}{when.time ? ` · ${when.time}` : ""} · {eventWhere(ev)}</p>
        {body}
        {summary}
      </Container>
    </section>
  );
}
