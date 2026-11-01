# PynkPours — Stage A: Technical Review & Implementation Plan

Status: **Revision 2: approved direction, Stage A implemented locally.** Nothing has been deployed, connected, or applied to any hosted database.
Date: 2026-11-01

> **Revision 2 changes (owner clarifications, 2026-11-01):**
> - Added §3.10–3.14: rate limiting, admin audit logs, ticket-hold expiration, backup and recovery testing, and attendee/sales exports.
> - Changed credential storage: ciphertext plus hash, instead of rotate-on-resend (see item 16).
> - Changed local test approach: Vitest-driven SQL tests on local Postgres 16 instead of pgTAP (see §2.5).
> - Updated the file tree for Next.js 16 (`middleware.ts` is now `proxy.ts`).
> - Remote changes paused: no commits or pushes until the owner confirms the GitHub account.

---

## 1. Inventory of supplied files

| File | What it is | Assessment |
|---|---|---|
| `START_HERE_FOR_CLAUDE.md`, `README.md`, `CLAUDE_BUILD_PROMPT.md` | Instructions and first-task requirements | Clear and consistent with each other |
| `PROJECT_BRIEF.md` | Full product requirements | Complete enough to build the MVP |
| `OWNER_DECISIONS.md` | Locked decisions | Respected throughout this plan; nothing is reopened |
| `DESIGN_SYSTEM.md` | Tokens, typography, component rules | Usable; fonts are not named (see §6) |
| `BUILD_AND_HANDOFF_PROTOCOL.md` | Stage gates and reporting rules | Adopted as-is |
| `ACCOUNT_SETUP_GUIDE.md` | New-account order and env var categories | Adopted; Supabase key names updated (§3.9) |
| `ACCEPTANCE_TESTS.md` | MVP QA checklist | Every item is mapped to a test in §5 |
| `CONTENT_AND_ASSET_CHECKLIST.md` | Missing owner content | Accurate; see §6 for additions |
| `supabase/migrations/20261031000100_initial_pynkpours_schema.sql` | Draft schema | A reasonable start, but **not safe for production as written** (§2) |
| `assets/brand/PynkPours-Official-Logo-Reference.jpeg` | 1254×1254 JPEG, circular emblem on solid black | Usable on black backgrounds only. There is no horizontal wordmark and no transparent version (§6) |
| `assets/design-references/*.png` (8 images) | AI-generated mockups: home, experiences, events, event detail, 3-step registration, confirmation, email, ticket, admin dashboard | Good visual direction. **They contain invented details that must not ship** (§6.3) |
| `reference-prototype/PynkPours-Website-Prototype.zip` | One 1 MB static `index.html` with 2 base64 JPEGs, no JS, no external requests | Visual reference only. Reusable: hero copy, pillar copy, section rhythm. Not reusable: system fonts, `mailto:` newsletter |

---

## 2. Review of the draft migration

### 2.1 Critical: must fix before any real data

1. **No inventory reservation model.** The only inventory control is a `quantity_sold` counter with a `CHECK`. It has no holds or expiry, so it can't support "reserve → pay → issue". There's also no safe way for concurrent checkouts to claim seats. **Fix:** add an `inventory_holds` table, and add a `SECURITY DEFINER` RPC `reserve_tickets()` that locks the `ticket_types` row (`FOR UPDATE`). The RPC computes `remaining = capacity − sold − active_unexpired_holds` and inserts the hold in the same transaction. Expired holds are ignored **lazily** when availability is computed, so correctness doesn't depend on a cron job running. A scheduled sweep (pg_cron) only cleans up rows.
2. **Supabase function grants are wrong.** `revoke all on function … from public` does **not** remove the grants Supabase's default privileges give directly to `anon` and `authenticated`. Every privileged RPC needs an explicit `revoke execute … from anon, authenticated` followed by a deliberate grant.
3. **The migration relies on Supabase's default table grants.** Supabase grants broad table privileges to `anon` and `authenticated` by default. `TRUNCATE` is not subject to RLS. **Fix:** revoke all privileges on every table from `anon` and `authenticated`, then grant back only specific `SELECT` privileges. Don't depend on platform defaults.
4. **`check_ins.ticket_id NOT NULL` makes "Invalid" scans impossible to log.** An unknown QR code has no ticket. **Fix:** make the column nullable, store the scanning station's event (`station_event_id`), and keep a hashed prefix of the presented credential for forensics.
5. **The `checked_in` ticket status conflicts with refund and cancellation.** A ticket can't be both `checked_in` and `refunded`. **Fix:** split validity (`valid | cancelled | refunded`) from attendance (`checked_in_at`, `checked_in_by`). Then make check-in a single conditional statement: `UPDATE tickets SET checked_in_at = now() … WHERE id = $1 AND status = 'valid' AND checked_in_at IS NULL RETURNING`. Back it with a partial unique index on `check_ins(ticket_id) WHERE result = 'accepted'`, so at most one scan can ever be accepted.
6. **No line items or price snapshot.** Attendees reference `ticket_type_id`, but the price paid isn't stored per item. If an admin edits a price later, order history becomes wrong. **Fix:** add an `order_items` table with `unit_price_cents`, `quantity` and `ticket_type_name` snapshotted at purchase. Add `CHECK (total_cents = subtotal_cents − discount_cents + fee_cents)`.
7. **No webhook idempotency or email outbox.** **Fix:** add `stripe_events (id text primary key, …)`, using an insert-or-skip as the idempotency gate. Add `email_messages` with `unique (kind, ticket_id)` / `unique (kind, order_id)`, so a duplicate webhook can't send a duplicate email. Its status, attempts and error columns support retry and admin resend.
8. **Cross-table consistency isn't enforced.** `tickets.event_id`, `tickets.ticket_type_id` and `orders.event_id` could point at different events. **Fix:** use composite foreign keys, such as `ticket_types unique(id, event_id)` with `tickets (ticket_type_id, event_id) references ticket_types(id, event_id)`. Apply the same pattern to attendees and orders.
9. **`ON DELETE CASCADE` on commerce records.** Deleting an order would silently delete its attendees and tickets. **Fix:** use `RESTRICT` everywhere in the commerce chain. Commerce records change state; they're never hard-deleted. Admins can delete only draft events that have no orders.

### 2.2 High: correctness and security gaps

10. **No role separation.** The brief requires "authorized check-in staff", but every admin has full power. **Fix:** add `admin_profiles.role` (`owner | admin | checkin`) and `is_active`. Check-in staff can only look up tickets and check them in. They can't see order totals or edit events.
11. **`sold_out` is a stored ticket status.** It goes stale as holds expire or refunds happen. **Fix:** derive it. The stored status becomes `active | paused | closed`, and sold-out is computed.
12. **The public ticket policy hides non-active tiers.** That makes it impossible to show "Sold Out" or "Sales closed". It also exposes the raw `capacity` and `quantity_sold`. **Fix:** anonymous users get no direct table access. They read a `public_event_ticket_availability` view, or a `SECURITY DEFINER` function, which returns only the display state, price and a coarse remaining count. "Only N left" appears only when the owner enables it.
13. **No guards on publishing.** An event can be published without a date, venue or ticket types. **Fix:** a trigger blocks `status → published` unless the required fields are present. It also validates `ends_at > starts_at`, the slug format, and that `timezone` is in `pg_timezone_names`.
14. **Currency is set per tier, but a Stripe Checkout session needs a single currency.** **Fix:** move `currency` to `events`, and have all of an event's tiers inherit it.
15. **No secure guest access to orders.** Guests have no login, so the confirmation and ticket pages need unguessable tokens. **Fix:** add `orders.public_token_hash`, used for `/orders/[token]`. The `/t/[credential]` ticket page hashes the credential from the URL to find the ticket. Both pages send `Referrer-Policy: no-referrer` and `noindex`.
16. **Resending a ticket when only a hash is stored.** The raw QR credential can't be re-emailed, because it was never kept. ~~The original fix was to rotate the credential on every resend.~~ **Revised fix (as built):** lookup uses only the SHA-256 hash of the credential. The app server also stores an **AES-256-GCM ciphertext** of the credential, encrypted with `TICKET_CREDENTIAL_KEY`. That key exists only in the app's environment and never reaches the database. As a result:
    - a database leak alone reveals no usable QR codes,
    - the guest ticket page and email retries can re-render the QR,
    - resending doesn't invalidate a guest's existing QR.

    **Rotation** still exists as an explicit admin action (`rotate_ticket_credential`), for example when a ticket was sent to the wrong person. The handoff's account guide anticipated this kind of server-only "ticket encryption key".
17. **No audit trail.** **Fix:** add an append-only `audit_log` (actor, action, entity, before/after JSON). Triggers on `events`, `ticket_types` and `admin_profiles` write to it, and so do server actions for refunds, resends and manual check-ins.
18. **Missing indexes on foreign keys and lookups.** These include `attendees.ticket_type_id`, `tickets.order_id`, `check_ins.ticket_id`, `lower(orders.purchaser_email)`, and a manual-lookup search on attendee name and email (`pg_trgm`).

### 2.3 Medium: lifecycle and data hygiene

19. **Orders need `expires_at`, `amount_refunded_cents`, and a `needs_review` flag.** The flag covers edge cases such as a payment that arrives after its hold expired and capacity is gone, or a partial refund made in the Stripe dashboard that can't be mapped to specific tickets.
20. **Email normalization.** Store email addresses trimmed and lowercased (or use the `citext` type).
21. **Sensitive free-text field.** `dietary_or_accessibility_notes` may contain health information. Replace it with configurable per-event questions (`event_questions`, plus `answers jsonb` on attendees). Collect it only when the event needs it and mention it in the privacy policy.
22. **`updated_at` triggers** are missing on `tickets` and `attendees`.
23. **Default timezone.** `timezone` defaults to `'America/Chicago'`. Require it to be set explicitly on every event instead of silently assuming one.
24. **Missing supporting tables:** `contact_submissions`, `newsletter_subscribers` (with consent timestamp and source), and `event_interest`. `event_interest` handles both "Coming Soon / Get Notified" and the optional waitlist with one lean table.
25. **Bundled tiers.** The mockup shows a "VIP Table (4)". To support that without special-casing, add `ticket_types.admits_per_unit` (default 1). One unit issues N individual tickets, each with its own attendee and QR. It's optional and costs almost nothing to include.
26. **Free tickets.** `price_cents = 0` is allowed, but Stripe Checkout can't charge $0. Free orders get a server-side path: reserve, mark the order "complete", then issue tickets. That path has its own rate limiting.

### 2.4 What the draft already gets right (kept)
- Admin status comes from a table, not from user-editable JWT metadata.
- `SECURITY DEFINER` with `search_path = ''` and `(select auth.uid())`.
- RLS is enabled on every table, and there are no public write policies.
- The single `pgcrypto`/`gen_random_uuid` dependency is fine.

### 2.5 Plan for the database
I won't edit the draft in place. I'll write a **replacement** set of migrations in `supabase/migrations/` and keep the original in `docs/reference/` for traceability. The replacement is tested in three places, all disposable:
- a local Postgres 16 / Supabase stack in this dev container (Docker is available),
- pgTAP RLS and privilege tests (`supabase test db`),
- concurrency tests that fire parallel reservation and check-in calls.

Nothing touches a hosted project until you approve.

**As built:** the official Supabase Docker images can't be downloaded in this workspace because the registry is blocked. Instead:
- Migrations run on a local, disposable **Postgres 16**.
- A small setup file (`supabase/tests/supabase-local-shim.sql`) recreates the parts of Supabase the migrations depend on: the `anon`, `authenticated` and `service_role` roles, `auth.uid()`, and Supabase's **permissive default privileges**.
- Tests are written in Vitest. Each one acts as the real API role, the same way Supabase's API layer does.

Before production, the same migrations must also pass on a real **disposable Supabase project or Supabase branch** (Stage G gate).

> **Update (Stage B):** Supabase's images were later pulled successfully from Docker Hub. All migrations now also apply cleanly on the **official Supabase local stack** (Postgres 17 image), the `pg_cron` sweep registers, and `supabase db lint` is clean. Production still requires the hosted-project gate above.

---

## 3. Architecture & security model

### 3.1 Stack
- **Next.js (current stable, App Router) + TypeScript (strict)**, Tailwind CSS with PynkPours design tokens, and server components by default.
- **Supabase**: Postgres, Auth (admins only), and Storage (event cover images, public bucket for published assets only).
- **Stripe Checkout** in test mode, using the hosted redirect. It's the simplest option for PCI scope (SAQ A) and the most robust. The mockup's on-page card form would mean Elements or Embedded Checkout, which we can revisit later without changing the backend.
- **Transactional email:** recommend **Resend** (a simple API, React email templates, free tier). **Postmark** is a good alternative with excellent deliverability. Either needs DNS records on pynkpours.com.
- **QR codes:** generated server-side with `qrcode`. Scanning uses `qr-scanner` or `@zxing/browser`, both of which work on iOS Safari (the native `BarcodeDetector` API doesn't).
- **Tests:** Vitest (unit tests, plus database tests run as the real Supabase API roles against local Postgres 16) and Playwright (end-to-end, mobile and desktop viewports).

### 3.2 Trust boundaries
| Actor | Can do |
|---|---|
| Anonymous visitor | Read published events through a safe view; call server actions for checkout, contact and newsletter (rate-limited, validated) |
| Guest with token | View their own order or ticket by unguessable token only |
| `checkin` staff | Look up tickets, check in, view attendance for events. No financial data, no editing |
| `admin` / `owner` | Manage events, tiers, orders and refunds; resend emails. Only `owner` manages staff |
| Server (secret key) | Webhooks, ticket issuance, email outbox. Isolated in `src/server/**` and marked `import 'server-only'` |

Every mutation goes through a server action or route handler. Each one validates input with Zod, re-checks the role on the server, and calls a single-purpose `SECURITY DEFINER` RPC or uses the secret-key client. The browser never sends prices, totals or statuses that the server trusts.

### 3.3 Checkout flow
1. The guest selects quantities on `/events/[slug]` and enters attendees on `/events/[slug]/checkout`.
2. A server action does the following: validates input; calls `reserve_tickets()` (row lock, capacity, sale window, max-per-order and event state, all checked atomically); creates the order as `pending` with `order_items` and `attendees`; creates a Stripe Checkout session from **database prices**; stores the session id; and redirects. The idempotency key is per form submit, so double-clicks don't create duplicate orders.
3. The hold lasts about 35 minutes, and the Stripe session expires at 30 minutes (Stripe's minimum). So a session can never outlive its hold.
4. The webhook `checkout.session.completed` with `payment_status = paid` is handled in steps. It verifies the Stripe signature against the raw request body. It inserts into `stripe_events`, and if the event was already processed, it returns 200. It then calls `fulfill_order()`, which in **one transaction** converts the holds to sold, marks the order paid, and issues one ticket per attendee with a random 256-bit credential. Only the SHA-256 hash of the credential is stored. Finally it enqueues emails in the outbox.
5. The success page `/orders/[token]` **polls the server**. It shows "Confirming payment…" until the webhook has marked the order paid. The redirect is never treated as proof of payment. If the webhook is delayed, the page falls back to retrieving the session from Stripe on the server.
6. `checkout.session.expired` and `async_payment_failed` release the holds and mark the order `cancelled` or `failed`.
7. Refunds are started from the admin panel, per ticket or for the whole order. Refunded tickets become invalid, and the order becomes `refunded` or `partially_refunded`. A `charge.refunded` event that came from the Stripe dashboard is reconciled. If it can't be mapped to specific tickets, the order is flagged `needs_review`. Whether refunded seats go back on sale is an admin choice per refund (default: yes, if the event hasn't started).
8. Async payment methods such as ACH are disabled. Cards and wallets only, for predictable fulfillment.

### 3.4 Check-in
- The QR code encodes `https://pynkpours.com/t/<credential>`. The credential is 43 base64url characters (256 bits). There's no personal data and no database id in it.
- A separate short **manual code** (8 random characters, unambiguous alphabet) is printed on the ticket for staff lookup. Lookup requires a staff login.
- The `check_in(credential, station_event_id)` RPC returns `accepted | already_checked_in | invalid | wrong_event | refunded | cancelled`, plus the ticket type, attendee name and original check-in time. Every scan is logged.
- The scanner page is mobile-first and has the following features:
  - camera permission handling
  - an "unavailable" fallback that switches to manual entry
  - large color- and icon-coded result screens
  - haptic and sound cues
  - a recent-scans list
  - attendance counts that refresh every few seconds (Supabase Realtime is optional later)
  It works from multiple devices at once because all state is on the server.

### 3.5 Email
An outbox table and an `after()` callback send right after the webhook responds. A retry sweep (Supabase pg_cron calling a protected route, or Vercel Cron) handles failures. Templates: order confirmation, plus one ticket email per attendee with the QR, a ticket link and an `.ics` calendar file. Admins can resend from the order or ticket view.

### 3.6 Abuse protection
Forms use a honeypot field, a minimum fill time, Zod validation and per-IP rate limits (stored in Postgres; the IP is hashed with a server salt). **Cloudflare Turnstile** is recommended for the contact, newsletter and checkout forms. It's free, but it's one more account. The checkout and webhook routes also get strict size limits.

### 3.7 Headers
- CSP with nonces, allowing Stripe and Supabase domains only
- HSTS
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin` globally, and `no-referrer` on token pages
- `Permissions-Policy` that grants `camera=(self)` on the scanner page only

### 3.8 Admin auth
- Email and password login with **TOTP MFA required** for all staff, enforced by checking the AAL2 assurance level on the server.
- Public signup is disabled in Supabase.
- Staff are created by a trusted CLI script (`scripts/create-admin.ts`) run with the secret key. They're never created from the client.

### 3.9 Environment variables (names only; these will go in `.env.example`)
```
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY      # Supabase's newer "publishable" key (replaces anon key)
SUPABASE_SECRET_KEY                       # server only (replaces service_role key)
STRIPE_SECRET_KEY                         # server only, sk_test_ until launch approval
STRIPE_WEBHOOK_SECRET                     # server only
RESEND_API_KEY                            # server only (or POSTMARK_SERVER_TOKEN)
EMAIL_FROM                                # e.g. "PynkPours <tickets@pynkpours.com>"
EMAIL_REPLY_TO
CONTACT_INBOX_EMAIL                       # where contact-form submissions are sent
RATE_LIMIT_SALT                           # server only, random
CRON_SECRET                               # server only, protects sweep endpoints
NEXT_PUBLIC_TURNSTILE_SITE_KEY            # optional
TURNSTILE_SECRET_KEY                      # optional, server only
```
A build-time check fails the build if any server-only name is prefixed with `NEXT_PUBLIC_`. A CI step greps the client bundle for `sk_`, `sb_secret_` and `whsec_`.

> **Added in Revision 2:** `TICKET_CREDENTIAL_KEY` (32 random bytes, base64, server only) and `STRIPE_ALLOW_LIVE` (must stay `false` until go-live approval; the app refuses `sk_live_` keys otherwise).

### 3.10 Rate limiting (owner requirement)
- **Mechanism:** a fixed-window counter in Postgres (`rate_limits` table plus the `check_rate_limit()` RPC, callable only by the server).
  - The key is an HMAC of the client IP with `RATE_LIMIT_SALT`, so raw IP addresses are never stored.
  - The increment is atomic, so limits stay exact under parallel bursts (tested: 30 concurrent requests against a limit of 10 lets exactly 10 through).
  - The 5-minute sweep removes rows older than a day.
- **Proposed limits** (tunable per route, enforced in each server action):

  | Route / action | Limit |
  |---|---|
  | Contact form | 5 per 10 minutes per IP |
  | Newsletter / Get-notified | 10 per hour per IP |
  | Checkout start | 10 per 10 minutes per IP, plus 30 per hour per email |
  | Order-status polling | 60 per minute per IP |
  | Admin sign-in | Supabase Auth's built-in limits, plus 10 per 10 minutes per IP at the app layer |
  | Check-in scans | Not limited per staff member; staff accounts are authenticated and audited |
- **Defense in depth:** honeypot field, minimum time to fill a form, request body size limits, and optional Cloudflare Turnstile on public forms.
- **Seat hoarding:** someone could start checkouts just to hold seats. This is limited by short holds, per-order maximums and the checkout rate limit above.

### 3.11 Administrative audit logs (owner requirement)
- **`audit_log` is append-only.**
  - Database triggers reject UPDATE, DELETE and TRUNCATE, even from the table owner.
  - The server role has no UPDATE or DELETE privilege on it.
  - Admins can read it; nobody can change it.
- **What is recorded automatically** (by triggers): every insert, update and delete on `events`, `ticket_types`, `event_questions` and `admin_profiles`. Each entry records the actor's user id, their role at that moment, and full before/after snapshots.
- **What the trusted functions record:**
  - payment fulfillment and orders flagged for review
  - refunds (with source and tickets affected)
  - ticket cancellations
  - undoing a check-in
  - credential rotation
  - ticket resends
  - **every attendee and sales export** (exports contain personal data, so it matters who downloaded them)
- System actions (webhooks, scheduled jobs) are recorded with no human actor. Check-in scans are recorded separately in `check_ins`, which logs the scanner, time, result and method.
- Stage C adds an admin "Activity" view with filters by event, staff member and action.

### 3.12 Ticket-hold expiration (owner requirement)
- **Every reservation creates `inventory_holds` rows** with an `expires_at`. The default is 35 minutes, and the Stripe Checkout session expires at 30 minutes, so a session can never outlive its hold.
- **Lazy expiry:** availability math ignores holds whose `expires_at` has passed, at the moment it reads them. Correctness never depends on a background job running (tested).
- **Event-driven release:** when Stripe reports `checkout.session.expired` or a failed payment, `release_order()` runs immediately. Repeating it does nothing harmful.
- **Sweep:** `sweep_expired()` runs every 5 minutes via `pg_cron` on Supabase, with a `CRON_SECRET`-protected route as a fallback. It marks abandoned orders `cancelled (checkout_expired)`, marks holds `expired`, and prunes old rate-limit rows.
- **Late payments** (payment that lands after the hold expired) are honored if capacity remains. Otherwise the order is recorded as paid, flagged `needs_review` for an admin refund, and issued **no tickets**. Never oversold (tested).

### 3.13 Backup and recovery (owner requirement)
- **Local drill (automated, runs in CI):** `tests/db/backup-restore.test.ts` populates a database with events, a paid order, a check-in and a pending hold, then restores it two ways:
  - (A) a full `pg_dump` restored into an empty database,
  - (B) a data-only dump restored into a freshly migrated database (the path used to move data into a new Supabase project).

  Each restore is checked for:
  - identical row counts in 12 tables
  - every security policy present, and security still enforced
  - check-in state preserved and working
  - order-number sequences continuing without reuse
  - the audit log still append-only

  **Finding:** data-only restores must load with `session_replication_role = replica`. Otherwise the publish guard rejects historical published events. This is documented in the runbook.
- **Production plan (owner approval needed, Stage G):**
  - **Supabase Pro** for automated daily backups (7-day retention). Optional **Point-in-Time Recovery** add-on, recommended once ticket sales begin.
  - A **weekly off-platform logical backup** (`pg_dump` to owner-controlled encrypted storage), run by a scheduled GitHub Action using a read-only database credential.
  - A **restore drill before launch and every quarter.** Restore into a *new, separate* Supabase project, never over production, then run the verification checks above against it.
  - Recovery targets (owner to confirm): data loss of at most 24 hours (minutes with PITR), and service restored within 4 hours.
  - Stripe remains the system of record for payments. A reconciliation script can re-derive order payment status from Stripe if the database is ever restored to an earlier point.

### 3.14 Attendee and sales exports (owner requirement)
- **Admin-only database functions** (each export is audited):
  - `export_attendees(event)`: order number, purchaser, attendee name/email/phone, ticket type, manual code, ticket status, check-in time, custom answers.
  - `export_sales(event)`: per paid order, the items, subtotal, discount, fee, total, refunded and net amounts, the Stripe payment reference, and the review flag.
  - `event_sales_summary(event)`: totals and units sold by tier, for the dashboard.
- **CSV generation** (`src/lib/csv.ts`) neutralizes spreadsheet formula injection. Cells starting with `= + - @` get a leading quote, because attendee names and answers come from the public.
- **Access:** check-in staff can't export (tested). Downloads are served with `Cache-Control: no-store`.

---

## 4. Proposed file tree

```
pynk-pours/
├─ .env.example
├─ .github/workflows/ci.yml            # typecheck, lint, unit, db tests, e2e, bundle-secret scan
├─ README.md                           # setup, local dev, deploy runbook
├─ docs/
│  ├─ STAGE_A_TECHNICAL_REVIEW.md
│  ├─ handoff/                          # original package docs (read-only copy)
│  ├─ reference/initial_draft_schema.sql
│  ├─ RUNBOOK_ACCOUNTS.md               # step-by-step new GitHub/Supabase/Vercel/Stripe/Resend setup
│  └─ QA_REPORT.md                      # filled in per stage
├─ public/brand/                        # logo derivatives (from supplied asset only)
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/
│  │  ├─ 0001_extensions_types.sql
│  │  ├─ 0002_core_tables.sql           # events, ticket_types, event_questions
│  │  ├─ 0003_commerce.sql              # orders, order_items, attendees, inventory_holds, tickets
│  │  ├─ 0004_operations.sql            # check_ins, stripe_events, email_messages, audit_log
│  │  ├─ 0005_public_inbound.sql        # contact, newsletter, event_interest, rate_limits
│  │  ├─ 0006_grants_rls.sql            # revoke-all + explicit grants + policies
│  │  ├─ 0007_rpcs.sql                  # reserve, fulfill, release, refund, check_in, lookup
│  │  └─ 0008_views_cron.sql            # public availability view, expiry sweep
│  ├─ seed.sql                          # LOCAL ONLY, clearly labelled "SAMPLE — NOT REAL"
│  └─ tests/supabase-local-shim.sql     # LOCAL ONLY: emulates Supabase roles/auth/default grants
├─ scripts/
│  ├─ create-admin.ts
│  └─ check-env.ts
├─ src/
│  ├─ app/
│  │  ├─ (public)/
│  │  │  ├─ page.tsx                     # Home
│  │  │  ├─ about/page.tsx
│  │  │  ├─ experiences/page.tsx         # Events list (upcoming/past, empty state)
│  │  │  ├─ events/[slug]/page.tsx       # Event detail + ticket selector
│  │  │  ├─ events/[slug]/checkout/page.tsx
│  │  │  ├─ partners/page.tsx
│  │  │  ├─ contact/page.tsx
│  │  │  ├─ privacy/ terms/ refunds/     # policy pages (owner content)
│  │  │  ├─ orders/[token]/page.tsx      # confirmation, polls payment state
│  │  │  └─ t/[credential]/page.tsx      # individual ticket + QR + add-to-calendar
│  │  ├─ admin/
│  │  │  ├─ login/  mfa/
│  │  │  ├─ page.tsx                     # overview
│  │  │  ├─ events/ (list, new, [id]/edit, [id]/tickets)
│  │  │  ├─ orders/ (list, [id])
│  │  │  ├─ attendees/
│  │  │  ├─ check-in/[eventId]/          # scanner + manual lookup + recent + counts
│  │  │  ├─ inbox/                       # contact, newsletter, interest
│  │  │  └─ staff/                       # owner only
│  │  ├─ api/
│  │  │  ├─ stripe/webhook/route.ts
│  │  │  ├─ cron/sweep/route.ts          # expire holds, retry emails (CRON_SECRET)
│  │  │  └─ events/[slug]/ics/route.ts
│  │  ├─ sitemap.ts  robots.ts  manifest.ts
│  │  └─ layout.tsx  globals.css
│  ├─ components/ (ui/, public/, admin/, checkout/, checkin/)
│  ├─ emails/ (OrderConfirmation.tsx, Ticket.tsx)
│  ├─ lib/ (format/datetime-tz, money, validation schemas, ics, qr)
│  ├─ server/                            # 'server-only'
│  │  ├─ supabase/{admin,server,browser}.ts
│  │  ├─ auth/requireRole.ts
│  │  ├─ checkout/, fulfillment/, refunds/, checkin/, email/, ratelimit/
│  └─ proxy.ts                           # Next 16 name for middleware: session refresh, admin gate, CSP nonce
└─ tests/
   ├─ unit/        # money, tz, credential, schemas, webhook handler (signed fixtures)
   ├─ db/          # security/RLS, checkout, lifecycle, concurrency, backup-restore (local Postgres)
   └─ e2e/         # Playwright: browse → buy (Stripe test) → ticket → check-in, mobile+desktop
```

Note on navigation: the brief specifies 6 pages, while the mockups also show "Experiences" and "Community". I plan to follow the brief. "Experiences" is the events listing (as the brief names it). The Community content becomes the newsletter section on Home, because membership/Society is out of scope. This is easy to change.

---

## 5. Staged plan

Every stage ends with a report covering: files changed, commands run, pass/fail results, gaps, owner actions, and environment (always **local** until Stage G).

| Stage | Deliverables | Done when (tests) |
|---|---|---|
| **A — Foundation** (after you approve this plan) | Next.js scaffold, tokens and fonts, lint/typecheck/CI, `.env.example`, the **replacement migrations** and pgTAP suite running on local Supabase, logo derivatives, handoff docs copied into `docs/` | RLS and grant tests pass; anon can't read or write private tables; reservation and check-in concurrency tests pass on the local DB |
| **B — Public site** | Home, About, Experiences (DB-backed, empty state), Event detail (tz-correct dates, agenda, FAQs, tier states), Partners, Contact (+ newsletter/interest capture), policy page shells, SEO and OG | Playwright at 375/768/1280 px with no horizontal overflow; drafts aren't visible; axe accessibility scan clean; forms validate and rate-limit |
| **C — Admin** | Login with MFA, role gate, overview, event CRUD with publish guards, tier editor (reorder, sale windows, pause/close), cover image upload, inbox views, audit log | Non-admin and `checkin` roles are blocked from management (server and DB tests); publishing an incomplete event fails |
| **D — Checkout & payments** | Ticket selector, per-attendee form with custom questions, reserve RPC, Stripe Checkout (test), signed idempotent webhook, expiry and failure handling, free-ticket path, refunds | Server recalculates prices; replaying a webhook twice gives 1 order, N tickets, 1 email set; expired session releases inventory; 50 concurrent buyers can't oversell |
| **E — Tickets, email & check-in** | Credential issuance and rotation, ticket page with QR and `.ics`, email templates and outbox with retry and resend, scanner PWA, manual lookup, recent scans, live counts | All 6 scan outcomes are tested; 20 parallel scans of one ticket produce exactly 1 accepted; resend invalidates the old QR |
| **F — QA hardening** | Full acceptance checklist run, security review, bundle-secret scan, Lighthouse/axe, `QA_REPORT.md` | Every item in `ACCEPTANCE_TESTS.md` is checked off with evidence, or listed as an open gap |
| **G — Accounts, preview & launch** (your accounts, your approval at each step) | Runbook walkthrough; migrations applied to **your new** Supabase project; Vercel **preview** deploy; Stripe test end-to-end on preview; on-device scanner test; then, with explicit approval: production deploy, domain, Stripe live mode | You sign off on each go-live gate in `ACCOUNT_SETUP_GUIDE.md` |

Stages A–F can be built and tested entirely in this environment with **no accounts at all**. Supabase runs locally in Docker. Stripe webhooks are tested with officially signed test payloads from the Stripe SDK. Email uses a local capture transport. A real Stripe test account is needed only for the final end-to-end checkout check, at the end of Stage D or in Stage G.

---

## 6. Owner decisions and assets needed

### 6.1 Blocking only at the stage noted
1. **GitHub repository confirmation (blocks all commits and pushes).** This session's working repository is `simplykryssie-blip/Pynk-Pours`. One review-document commit was pushed there on 2026-11-01 before your confirmation; that was an error on my part. By owner instruction, **no further commits or pushes** will be made until you confirm the dedicated account. All Stage A work is uncommitted in the local workspace.
2. **Hosting plan cost (blocks Stage G).** Vercel's free Hobby plan is limited to **non-commercial** use, so selling tickets requires **Vercel Pro** (about $20/month per seat). Supabase Free pauses inactive projects and has no automated backups. **Supabase Pro** (about $25/month) is recommended for a production ticketing database. Both are paid and need your approval.
3. **Domain DNS access (blocks email sending and launch).** Where is pynkpours.com registered, and do you control its DNS? Email-provider verification and Vercel both need DNS records.
4. **Fees and tax (blocks Stage D pricing display).** Do buyers pay a processing fee, as the mockup shows, or do you absorb it? Should sales tax be collected? Ticket and admission tax rules vary by state and parish, so please confirm with your accountant. I'll build fee and tax support as configurable and default both to **off**.

### 6.2 Content (blocks publishing, not building)
- **Logo:** a transparent PNG or SVG, and especially a **horizontal "PynkPours" wordmark** for the header. The supplied file is only the circular emblem on black, which is illegible at header size. Until then, the header uses the emblem plus the name set as plain text, not a redrawn logo.
- **® symbol:** the logo uses ® on "PynkPours" and "Where Ideas Meet Opportunity". Please confirm both are federally registered. If they aren't, US practice is to use ™ instead. I won't alter the artwork either way.
- **Brand fonts:** if you have specific fonts, tell me. Otherwise I'll propose a free pairing such as Playfair Display or Cormorant for headlines and Inter or Montserrat for body text, matched to the mockups.
- **Copy and policies:** About copy, contact email (is `hello@pynkpours.com` real and monitored?), phone and address (if public), partner packages, and the terms, privacy and refund policies. Stripe requires a visible refund policy and contact details.
- **Entrepreneurial Brunch:** all event details (the date in the mockups, Mar 14, 2026, is already in the past).
- **Event photography.** Without it, I'll use typographic and brand-color layouts, with no stock or AI imagery presented as real.
- **Alcohol and age:** do any events serve alcohol and need an age (21+) attestation at checkout? I'll add an optional per-event age-requirement field either way.

### 6.3 Invented details in the mockups that will not be used
Event dates, prices ($59, $99, $375), "Lake Charles, LA", speaker names and photos (Jade Larue, Monique Carter), the phone number (337) 214-5016, the sample attendees, the revenue figures, the other event names (PynkPours Social, Build & Scale Lab, Conversations, Retreat), and the sample ticket number. Local seed data will be labelled **"SAMPLE — NOT REAL"** and can't be loaded into a hosted project.

### 6.4 Account and connector isolation
This session has Supabase, Vercel and other connectors attached. I don't know which accounts they belong to, so **I won't call any Supabase or Vercel tools.** When your new accounts exist, I'll give you a step-by-step runbook. You'll either run the setup yourself or connect the new accounts specifically, and you'll keep all credentials. Never paste secrets into chat.
