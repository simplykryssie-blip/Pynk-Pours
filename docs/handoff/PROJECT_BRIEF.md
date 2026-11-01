# PynkPours — Product & Build Brief

## Product goal
Build a polished, mobile-first event and ticketing platform for PynkPours. The public experience should communicate the brand and sell tickets. The private admin experience should let the owner create events, configure tickets, manage registrations, and check guests in.

**Launch principle:** lean, reliable, secure MVP. Do not build speculative features or mark a feature complete until it has been implemented and tested.

## Brand and visual direction
- Brand: **PynkPours**
- Brand line: **SIP • CONNECT • CREATE**
- Positioning: **Where ideas meet opportunity.**
- Palette: luxury black, blush/pink, metallic-gold accents, and warm cream.
- Typography: elegant editorial serif headlines; clean, highly legible sans-serif for labels, body copy, and controls.
- Overall feel: modern, elevated, welcoming, editorial, uncluttered. Strong typography and generous whitespace.
- Responsive: design mobile-first, then scale to tablet and desktop.
- Use the user's official PynkPours logo asset when supplied. Do not invent or redraw a replacement logo. Do not use placeholder logos in production.
- Avoid visual clutter, excessive gold decoration, generic luxury props, or stock imagery that competes with event content.

## Public website pages
1. Home — brand introduction, featured upcoming experience, clear event CTA, about/brand story, community/newsletter signup if enabled, partners/sponsors, contact.
2. About — mission, brand story, what PynkPours experiences offer.
3. Experiences / Events — list of published upcoming events, with useful empty state when none are published.
4. Dynamic event detail page — one route per event, generated from database content.
5. Partners / Sponsorships — partnership information and inquiry CTA.
6. Contact — contact form with server-side validation and spam protection.

The Entrepreneurial Brunch should have a permanent event page when its actual event details are supplied. Do not invent dates, times, venue, ticket prices, speakers, sponsors, or event details. Use clearly labeled draft placeholders in admin only; never publish invented details.

## Event detail page content
- Cover image, event title, short description, full description.
- Local date/time and timezone, venue name/address, useful venue notes.
- Agenda/schedule, speakers or special guests when relevant.
- Event-specific ticket options and clear prices.
- FAQs, parking/accessibility/dress code/refund details when supplied.
- Registration state and CTA.

## Flexible event ticketing
Every event owns its own independent ticket configuration. Support:
- One fixed-price ticket or multiple custom ticket types.
- Optional tiers such as Early Bird, General Admission, VIP, or any custom label. VIP is never mandatory.
- Price and currency per ticket type.
- Capacity/quantity, maximum per order, sales start/end, active/paused/closed state, and display order.
- Registration states: Coming Soon / Get Notified, Available / Get Tickets, Sold Out, Registration Closed.
- Per-event sold-out behavior: display Sold Out or offer a waitlist. Waitlist is optional and should not block MVP ticket sales.
- Optional promo codes only if time and scope permit; do not let promo codes delay core checkout.
- Prevent overselling, including concurrent checkouts. Inventory reservations need expiration and release logic.

## Guest checkout — no attendee accounts
- Guests do not create accounts, passwords, or profiles.
- Purchaser can buy multiple tickets in one order.
- Each ticket can be assigned to a different attendee, with attendee name and email collected per ticket. Support phone and event-specific optional questions where appropriate.
- Do not require attendees to log in to view tickets.
- Collect only necessary personal information. Protect attendee data from public access.

## Payments and order lifecycle
- Use Stripe Checkout for payment collection.
- Use server-side Stripe secret keys only; never expose secret keys in browser code.
- Verify Stripe webhook signatures.
- A successful browser redirect is not proof of payment. Confirm paid status only after a verified webhook or trusted server-side Stripe verification.
- Make webhook handling idempotent; duplicate events must not create duplicate orders, tickets, emails, or inventory changes.
- Model pending, paid, failed, cancelled, refunded, and partially refunded states.
- Define and test behavior for abandoned/expired checkout, payment failure, full refund, and partial refund.
- Do not accept live payments until the complete payment and fulfillment flow passes test-mode QA.

## Digital tickets and QR check-in
- Issue one unique ticket per attendee, not one QR per order.
- QR must contain an unguessable random credential, not personal information or a sequential/predictable database ID.
- Store a secure hash of the credential; do not store or expose raw credentials unnecessarily.
- Validate ticket, event, paid order, and cancellation/refund status server-side.
- Check-in must be atomic/race-safe: only one concurrent scan may succeed.
- Responses: Accepted, Already Checked In, Invalid, Wrong Event, Refunded, Cancelled.
- Record scan timestamp and authorized admin/scanner identity.
- Provide a manual attendee/ticket lookup fallback and recent check-in list.
- Show live or refreshable attendance counts.
- Identify ticket type (e.g. VIP vs General Admission) to authorized check-in staff.
- Build a mobile-friendly web check-in screen/PWA-style experience; a separate native app is not required for launch.

## Private admin dashboard
- Admin authentication is required. Public guests never receive admin access.
- Overview: upcoming events, tickets sold, orders, check-in totals.
- Events: create, edit, draft, publish, unpublish, cancel, complete.
- Ticket management: create/edit/reorder ticket types; price, quantity/capacity, sale windows, status.
- Registrations/orders: search and view order and attendee details, payment/refund status.
- Attendees/tickets: search, inspect ticket status, resend ticket email where supported.
- Check-in: camera scanning, manual lookup, scan history, attendance count.
- Keep sensitive actions server-authorized and audit important admin actions.

## Email delivery
- Send order confirmation and individual ticket emails after verified payment.
- Include event details, attendee/ticket details, and QR code/ticket link.
- Do not send duplicate confirmations for duplicate webhooks.
- Select/configure an email provider during implementation; keep credentials server-side.
- Handle email delivery failures with retry/logging and an admin resend option.

## Technical direction
- Web app: Next.js + TypeScript, responsive UI.
- Database and admin authentication: Supabase (Postgres + Auth + Row Level Security).
- Payments: Stripe Checkout + signed webhooks.
- Hosting: Vercel.
- Source control: a new dedicated GitHub repository.
- QR generation/scanning: secure server-validated credentials and browser camera support.
- Use environment variables for all credentials. Provide `.env.example` with names only and no secrets.
- New, dedicated PynkPours accounts/projects for GitHub, Supabase, and Vercel. Do not connect to MKB Financial Group, Monarch Tax Suite, VerexaHQ, or any existing business project.
- User owns the accounts and production resources.

## Initial database foundation
The supplied `supabase/migrations/20261031000100_initial_pynkpours_schema.sql` is a starting schema for events, ticket types, orders, attendees, tickets, check-ins, and admin profiles. It is not a complete or production-reviewed implementation. Review and improve it before applying it to a new PynkPours Supabase project. Implement missing constraints, inventory reservation, safe RPC/server operations, indexes, auditability, and security tests as required.

## Explicitly out of launch scope
- PynkPours Society membership program.
- Guest accounts, attendee profiles, or attendee login.
- Loyalty/rewards.
- Complex marketing automation/CRM.
- Multi-tenant or multi-organizer platform.
- Native iOS/Android apps.
- Advanced analytics beyond practical sales and attendance summaries.

Keep the architecture extensible for a future optional membership program, but do not implement it in MVP.

## Delivery expectations
Work in small, reviewable stages. Before each stage, state what will be changed. After each stage, report files changed, commands/tests run, test results, known gaps, and any user action required. Never claim deployment, integration, or testing that did not actually occur. Do not apply production migrations, create paid resources, or switch Stripe to live mode without explicit owner approval.
