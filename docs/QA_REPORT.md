# PynkPours — QA Report

## Stage A: Foundation (local only)

**Environment:** local development workspace only. Nothing has been deployed, no hosted database has been touched, no external accounts or services were connected, and nothing has been committed or pushed, per owner instruction.
**Date:** 2026-11-01

### What was built
| Area | Deliverable | Location |
|---|---|---|
| Reference | Original draft migration kept byte-for-byte (checked with `cmp`) | `docs/reference/ORIGINAL_DRAFT_20261031000100_initial_pynkpours_schema.sql` |
| Reference | Handoff documents and design mockups | `docs/handoff/`, `docs/design-references/` |
| Database | Replacement migrations (8 files) | `supabase/migrations/20261101000100…000800` |
| Database | Local setup file that recreates Supabase's roles, `auth` schema and default privileges | `supabase/tests/supabase-local-shim.sql` |
| Database | Script to start and stop a disposable local Postgres 16 | `scripts/db/local-pg.sh` |
| App | Next.js 16.4 + React 19 + TypeScript (strict) + Tailwind 4 scaffold | `src/`, `next.config.ts` |
| App | Security headers: HSTS, frame denial, nosniff, referrer policy, permissions policy, no-referrer and noindex on token pages | `next.config.ts` |
| App | Design tokens (DESIGN_SYSTEM.md) and a font pairing (pending owner confirmation) | `src/app/globals.css`, `src/app/layout.tsx` |
| App | Holding page showing the supplied logo (no invented content); favicons resized from the supplied logo only | `src/app/page.tsx`, `src/app/icon.png`, `src/app/apple-icon.png` |
| App | Server environment validation; refuses live Stripe keys without `STRIPE_ALLOW_LIVE=true` | `src/server/env.ts` |
| App | Ticket credential generation, SHA-256 hashing, AES-256-GCM encryption, manual codes, order tokens, rate-limit keys | `src/server/credentials.ts` |
| App | Money, event-timezone date formatting, and CSV export with formula-injection protection | `src/lib/` |
| Tooling | `.env.example` (variable names only), client-bundle secret scan, CI workflow (local file, not pushed) | `.env.example`, `scripts/check-client-bundle.sh`, `.github/workflows/ci.yml` |

### Commands run and results
| Command | Result |
|---|---|
| `npm run lint` | Pass: 0 errors, 0 warnings |
| `npm run typecheck` | Pass |
| `npx vitest run` (all) | **133 / 133 passed**, 8 files, about 3 seconds |
| `npm run build` | Pass: Next.js 16.4.3 production build |
| `npm run check:bundle` | Pass: no secret patterns found in `.next/static` |
| Bundle-scan canary (planted a fake `sk_test_…` in the bundle) | Correctly **failed**, then the canary was removed |
| Mutation test: removed the seat-reservation lock and the atomic check-in condition | Concurrency tests correctly **failed** (4 of 6); passed again once the code was restored |
| `curl -I` against the production server | Security headers present; token routes return `no-referrer`, `noindex` and `no-store` |
| Playwright at 375 px and 1280 px | Renders; **no horizontal overflow** (screenshots in `docs/qa/`) |

### Test inventory
| File | Tests | Covers |
|---|---|---|
| `tests/db/security.test.ts` | 59 | Anonymous visitors can't read, write or truncate private tables, or call privileged functions. Non-staff users see nothing. Check-in staff can't read orders or export. Admins can't write commerce tables or inventory counters. Owner-only staff management, including the last-owner guard. Server role can't truncate or rewrite the audit log. RLS enabled on every table. Every SECURITY DEFINER function pins `search_path`. |
| `tests/db/events-checkout.test.ts` | 20 | Publishing guards; timezone, slug and time validation. Single fixed-price ticket and multiple tiers. VIP optional. Derived display states. Remaining count hidden unless the event opts in. Server-computed totals that ignore client prices. Idempotent submit. Sale windows, tier status, event-start cutoff. Per-tier and per-event limits. Cross-event tiers rejected. Bundles (one unit admits N people). Required questions. |
| `tests/db/concurrency.test.ts` | 6 | 50 parallel buyers for 10 seats: exactly 10 succeed. Shared event capacity across tiers. Paying every successful hold never exceeds capacity. 8 concurrent fulfillments of one order: tickets and emails issued exactly once. 20 parallel scans from 5 devices: exactly 1 accepted. QR and manual check-in racing: exactly 1 accepted. |
| `tests/db/lifecycle.test.ts` | 27 | Lazy hold expiry and the sweep. Release on payment failure and expiry, with a harmless repeat. No tickets before payment. Amount or currency mismatch flagged for review. Free-ticket path. Late payment with and without remaining capacity. Full and partial refunds, duplicate refund notices ignored, dashboard refunds, bundle inventory release. All 6 check-in outcomes. Attendance, recent scans and manual lookup (wildcards escaped). Undo check-in (admin only, audited). Credential rotation. Email outbox claimed exactly once under concurrency, with backoff and resend. Rate limits (exact under concurrency). Exports (admin only, audited). Audit of system actions and staff changes. |
| `tests/db/backup-restore.test.ts` | 2 | Full dump restored into an empty database; data-only dump restored into a freshly migrated database. Both verified for row counts, security policies, enforced access, check-in state, sequence continuity, and the append-only audit log. |
| `tests/unit/credentials.test.ts` | 9 | Credential entropy, format and uniqueness; hashing; encryption round trip; tampered data and wrong keys rejected; manual code format; token hashing; salted rate-limit keys. |
| `tests/unit/env.test.ts` | 4 | Missing variables named without echoing values; live-key guard; credential key length. |
| `tests/unit/lib.test.ts` | 6 | Money formatting; times shown in the event's timezone, including DST; CSV escaping and formula-injection protection. |

### Acceptance checklist items covered at the database layer
These are proven at the **database and function level**. Each item still needs end-to-end confirmation through the UI and real Stripe test mode in later stages.

- Only published events are visible publicly; draft and cancelled events can't be purchased.
- One fixed-price ticket, or multiple custom tiers; VIP optional.
- Price, capacity, max per order, sale window, status and ordering per tier, enforced on the server.
- Concurrent checkouts can't oversell; expired or abandoned holds release inventory.
- The server recalculates all prices; client-sent values are ignored.
- No tickets before payment; mismatched payments are flagged and issue no tickets.
- Duplicate payment fulfillment is idempotent (no duplicate tickets, emails or inventory changes).
- Full and partial refunds update ticket validity.
- Per-ticket random credential; only the hash is used for lookup; no personal data in the credential.
- Email messages queued exactly once; failures retried; admin resend.
- Check-in: all 6 outcomes; race-safe; scanner identity and timestamp recorded; manual lookup; ticket type visible; attendance totals.
- Private tables have no public read or write access; RLS and authorization tests cover private tables and mutations.
- Staff are created only through a trusted process (no public or client-side profile writes).
- `.env.example` contains names only.

### Known limitations and open risks
1. **No real Supabase instance was used.** Supabase images can't be downloaded here (registry blocked). The local setup file reproduces Supabase's roles, `auth.uid()` and default privileges, but the migrations **must also pass on a disposable Supabase project or branch** before production. This is a go-live gate.
2. **`pg_cron` scheduling is untested locally** (the extension isn't available here). The migration schedules the sweep only if `pg_cron` exists. Hold-expiry correctness doesn't depend on it (lazy expiry is tested).
3. **The holding page uses the supplied JPEG** on a near-black background. A transparent PNG or SVG and a horizontal wordmark are still needed for the header (Stage B).
4. **No Stripe, email, Supabase Auth or browser camera integration exists yet.** These are Stages C–E; the database functions they call are built and tested.
5. **The CI workflow has never run on GitHub** (nothing has been pushed).
6. `npm audit` reports advisories in scaffold dependencies. These will be reviewed before Stage G.

### Owner actions
- Confirm whether `simplykryssie-blip/Pynk-Pours` is the dedicated PynkPours GitHub repository. No commits or pushes happen until you do.
- Questions from the technical review (§6) remain open: hosting plan cost, domain/DNS, fees and tax, assets and fonts, inbox, and alcohol/age policy. None of them block Stage B, which uses clearly labeled placeholders.

---

## Stage B: Public website (local only)

**Environment:** local development workspace only. Nothing has been deployed. No external account, hosted database or third-party service was connected. Event data comes from the **official Supabase local stack** (Docker, `supabase/postgres:17.11` image) loaded with clearly labeled **SAMPLE** data.
**Date:** 2026-11-01

### What was built
| Area | Deliverable |
|---|---|
| Pages | **Home** (hero, Sip/Connect/Create pillars, featured experience, upcoming events, newsletter), **About**, **Experiences** (experience formats and the signature brunch), **Events** (upcoming and past tabs, empty state), **Event detail** (one reusable page per event, built from the database), **Partners & Sponsorships** (with inquiry form), **Contact**, policy placeholders (**Privacy**, **Terms**, **Refunds**), branded **404** |
| Event pages | Database-driven: title, category, cover (or a brand panel), date and time **in the event's own timezone**, venue or "to be announced", description, ticket tiers (prices, inclusions, availability), schedule, speakers, FAQs, dress code, age, parking, accessibility, refund notes, **Add to calendar** file. Ready to connect to admin event management (Stage C) with no code changes. |
| Registration states | One shared rule (`src/lib/registration.ts`) decides each event's call to action: Coming soon (get notified), Tickets available, Sales open soon, Sold out, Waitlist, Closed, Cancelled, Past. Until online checkout arrives in Stage D, events with tickets on sale offer "Notify me when registration opens" instead of taking payment. |
| Entrepreneurial Brunch | Featured on Home and Experiences, with a permanent page at `/events/entrepreneurial-brunch`. It uses **only your brand copy**: no date, venue, price or speakers. It shows "Date to be announced" and "Venue to be announced" and collects "Get notified" sign-ups. If the brunch isn't yet published in the database, the Home page shows a static teaser whose button goes to the newsletter sign-up. |
| Forms | Contact, partnership inquiry, newsletter (footer and home), event "get notified" and waitlist. Each has server-side validation, error messages next to the relevant field, kept input after an error, loading and success states, a hidden honeypot field, a minimum fill time, and rate limiting with visitor IPs hashed. Repeat newsletter sign-ups get the same reply as new ones, so nobody can test whether an address is already subscribed. |
| Branding | Your **official logo, unaltered**, in the header, hero, About page and footer. The site name next to it is plain text, not a recreated logo. Black, blush, gold and cream from DESIGN_SYSTEM.md. Proposed fonts: Playfair Display and Inter. No stock or AI images are used to represent real events. |
| Editable copy | All marketing text is in `src/content/site.ts`, and each block notes its source (prototype, mockups or brief). |
| SEO | Page titles and descriptions, event metadata, `sitemap.xml` (published events only). `robots.txt` **blocks all indexing** until you approve launch (`SITE_INDEXABLE=true`). |
| Schema change | Coming-soon events can now be published without a date or venue ("to be announced"). Ticket-selling events still require date, timezone, venue and at least one tier. This is tested. |
| Supabase on the official image | All 8 migrations applied cleanly to the official Supabase Postgres 17 image. The scheduled cleanup job (`pg_cron`) is registered. The Supabase linter found one warning (a missing type cast in the refund function), which is fixed; the linter is now clean. |

### Commands run and results
| Command | Result |
|---|---|
| `npx supabase start` (official images from Docker Hub) | All 8 migrations applied; cleanup job scheduled every 5 minutes |
| `npx supabase db lint --level warning` | **No schema errors** (after the type-cast fix) |
| Requests to the real Supabase API as an anonymous visitor | Published events only (draft hidden). `orders` **denied**. `admissions_sold` **denied**. Ticket-options lookup allowed. `create_pending_order` **denied** |
| `npm run verify` (lint, types, unit and database tests, build, bundle scan) | **Pass:** 150 / 150 tests (35 unit, 115 database), build OK, no secrets in the client bundle |
| `npx playwright test` (phone 375 px and desktop 1280 px) | **83 passed, 0 failed** (3 skipped: tests that apply only to the other screen size) |

### End-to-end coverage (`tests/e2e/`)
- **Pages (14 routes × 2 screen sizes):** HTTP 200, correct heading, header and footer present, **no horizontal overflow**, **no console errors or failed requests**, and **no serious or critical accessibility violations** in the axe WCAG 2.1 AA scan.
- **Links:** every internal link on every page was collected and requested, and all resolve.
- **Navigation:**
  - The desktop menu highlights the current page.
  - The phone menu opens, closes after navigating, closes with Escape and returns keyboard focus.
  - Logo, header button, hero buttons, skip link and footer links all work.
  - The phone header fits at 375 px.
  - The footer newsletter field is a usable width on desktop.
- **Events:**
  - Only published events are listed; drafts are never shown.
  - The past-events tab works.
  - Times include the event's timezone (CST/CDT).
  - Ticket tiers show correctly, with VIP optional.
  - The Entrepreneurial Brunch shows no dates or prices.
  - Sold-out events with a waitlist offer it; past events can't be registered for.
  - Draft and unknown event URLs show the not-found page with `noindex` and leak no content.
  - The calendar file works for dated events only.
- **Forms:**
  - Validation messages and kept input.
  - Submissions are stored in the database (checked directly).
  - Bot submissions (honeypot filled, or too fast) are silently dropped.
  - The 6th contact submission within 10 minutes is rejected.
  - The partner inquiry form defaults to "partnership".
  - The newsletter stores an address once, even when submitted twice.
  - Notify and waitlist sign-ups are stored with the correct type.

### Bugs found and fixed during Stage B testing
1. **Duplicate form-field IDs.** On pages with two forms (any page plus the footer newsletter), both email inputs shared one ID. Labels then pointed at the wrong input, which affects screen readers and label clicks. Each field instance now gets a unique ID. Two earlier tests had been passing only *because* of this bug; they now target the correct form.
2. **Empty optional field rejected.** The event sign-up form failed validation because an empty optional "quantity" field was read as 0. Fixed, with a unit test.
3. **Phone header crowding.** The header button showed at 375 px and cut off the brand name, because the button's display style overrode the "hidden" rule. Fixed, with a regression test.
4. **Footer newsletter field too narrow** on desktop. The form now stacks in narrow columns; a test checks the width.
5. **Flaky rate-limit test.** A burst that crossed a fixed time-window boundary was correctly allowed through twice. The test now uses a window too long to cross; the behavior is documented below.

### Known limitations and open items
1. **No online checkout yet (Stage D).** Events with tickets on sale collect "notify me" sign-ups instead.
2. **Unknown or draft event URLs return HTTP 200** with the not-found page and a `noindex` tag, instead of a true 404. This is a trade-off of streaming pages: the header and footer are sent before the event lookup finishes. I tested making the page wait for the data, and it didn't change the status code. Search engines respect `noindex`, and no content leaks. This will be revisited in Stage F if needed.
3. **The baseline security headers are in place, but the stricter content security policy that uses per-request codes ("nonces") is deferred to Stage F.** It forces every page to render on each request, which needs a performance check first.
4. **Contact and inquiry submissions are stored but don't yet email staff.** The email outbox and delivery provider arrive in Stage E. Staff can read submissions in admin (Stage C).
5. **Fixed-window rate limits can allow up to twice the limit** in a burst that straddles a window boundary. That's acceptable for spam control.
6. **No real event photography.** Events without a cover image show a branded panel. Covers are uploaded through admin in Stage C.
7. **Marketing copy still needs your approval:** About story; the 6 experience formats (taken from your mockups; please confirm which you actually offer); partnership packages and media kit. Contact email, phone and social links are **hidden** until confirmed.
8. **Policy pages are placeholders.** Stripe requires real refund and terms policies before going live.
9. **Bot protection (Turnstile) is optional** and not enabled; it needs a free Cloudflare account.
10. **The CI workflow, including the new end-to-end job, has not run on GitHub yet.** It will run on the next push if GitHub Actions is enabled.
11. **Tested only in Chromium**, at phone and desktop sizes. Safari and Firefox checks, plus real-device checks, are planned for Stage F.

### Screenshots
`docs/qa/stage-b/`: Home, About, Experiences, Events, Brunch, sample event, Partners and Contact, each at 375 px and 1280 px.

---

## Stage C: Admin dashboard (local only)

**Environment:** local development workspace only, using the **official Supabase local stack** (Docker) with SAMPLE and DEMO data. Nothing has been deployed. No external or production account was connected.
**Date:** 2026-11-01

### What was built
| Requirement | Delivered |
|---|---|
| **Secure admin sign-in with authenticator MFA** | Email and password, then a 6-digit authenticator code (TOTP; works with Google or Microsoft Authenticator, 1Password and similar apps). First sign-in walks through QR-code setup.<br><br>**MFA is enforced in the database:** staff permissions require an MFA-verified session (`aal2`), so a stolen password alone gets nothing, even through the raw API. The guard on every admin page and action checks the user, the MFA level and the database role.<br><br>Session cookies are httpOnly, so page scripts can't read them. Public sign-up is disabled. Sign-in and MFA attempts are rate limited, and every sign-in failure shows the same message, so nobody can test which emails have accounts. |
| **Dashboard overview** | Upcoming events (published and drafts), registrations (paid orders), tickets sold, checked in, and ticket sales net of refunds. An upcoming-events table shows per-event tickets against capacity, check-ins and sales. Alerts appear for orders needing review and new inbox messages. |
| **Event management** | **Create, edit, duplicate, publish, unpublish, archive and restore**, plus mark completed, cancel event, and delete a never-published draft.<br><br>Events have a full editor: basics; dates and times in the **event's own timezone** (stored as exact UTC times and safe across daylight-saving changes); location; registration settings; and a schedule, speaker and FAQ list editor.<br><br>Publishing rules are enforced by the database. Coming-soon events can be published with "date to be announced"; ticketed events need a date, venue and at least one ticket type. |
| **Event images and promo assets** | Upload JPG, PNG or WebP up to 5 MB. Every image is **re-encoded on the server**, which proves it's a real image, **removes EXIF and GPS data** and resizes it. Set the cover image, add images to the public gallery, write image descriptions, copy a shareable link, or delete. Storage is admin-write-only, and files can't be listed publicly. |
| **Ticket builder** | Custom names, prices (including free), quantity (or unlimited), max per order, **guests per ticket** (for example, a table for 4 gets 4 QR tickets), sales-open and sales-close times, Active/Paused/Closed, description and inclusions, edit, reorder, and delete (blocked once the ticket has orders).<br><br>Live counts for **sold / in checkout / left**. An **event-level registration deadline** caps every ticket's sales window. VIP is never required. |
| **Registrations and attendees** | All orders across events, with search by name, email or order number and filters (paid, all, needs review). The order page shows the purchase, line items, attendees, ticket codes and check-in status. **Attendee corrections** are audited with before and after values.<br><br>Each event has an attendee list with search, **CSV exports** (attendees, sales, sign-ups) and get-notified/waitlist lists. Every export is recorded in the activity log. |
| **Staff roles** | **Owner** (everything plus staff), **Admin** (events and sales), and **Check-in staff**: check-in only, with **no financial data** and no editing.<br><br>The owner adds staff (a temporary password is shown once, and the person must set up MFA at first sign-in), changes roles, removes or restores access (takes effect on their next request), and **resets a lost authenticator**. |
| **Check-in (manual)** | Choose an event, see live attendance counts by ticket type, search by name, email, ticket code or order number, and check guests in with one tap (race-safe; scanner identity recorded). A recent check-ins list is shown. Camera QR scanning comes with digital tickets in Stage E. |
| **Preview before publishing** | Renders the draft with **the same component the public site uses**, under a "Preview, not public" banner. The public URL stays not-found until you publish. |
| **Phone-friendly admin** | A compact top bar and menu drawer on phones. Tables scroll sideways inside their own area, buttons are large enough to tap easily, and the forms work on phones. |
| Also | **Inbox** for contact and partnership messages (mark handled or spam) and a newsletter CSV download. **Activity log**: a permanent, append-only record of changes and exports. **My account**: change password. No CRM, membership or marketing automation was added. |

### Database changes (migration `20261101000900_admin.sql`)
- **MFA-required staff role check**
- **`archived_at`:** hidden from the public, cannot be published, cannot be ordered
- **`registration_closes_at`**
- **`event_media`** table, with the Storage bucket and its rules
- **Admin functions:** duplicate event, reorder tickets, edit attendee, events overview (financial columns hidden from check-in staff), per-ticket statistics
- **Direct attendee → order and attendee → ticket type links**, so the dashboard can load linked data
- **Admin draft preview** in the ticket-options lookup
- **Verified:** applied cleanly to the official Supabase Postgres 17 image, and `supabase db lint` is clean.

### Commands run and results
| Command | Result |
|---|---|
| `npm run verify` (lint, types, unit and database tests, build, bundle secret scan) | **Pass: 177 / 177** (49 unit, 128 database), build OK, no secrets in the browser bundle |
| `npx playwright test` (public site and admin, phone 375 px and desktop 1280 px), fresh local data | **125 passed, 0 failed** (19 skipped by design: data-changing flows run once on desktop, and phone-only checks skip on desktop). **0 server-side errors** during the run |
| `npx supabase db lint --level warning` | No schema errors |
| Recorded walkthrough (`playwright.demo.config.ts`) | Pass. 19 captioned screenshots and 2 videos |

### End-to-end admin tests (`tests/e2e/admin.spec.ts`)
These use a **real password and authenticator code**. The test suite computes the codes exactly as a phone app does, and that generator is verified against the official RFC 6238 test values.

- **Access control:**
  - Signed-out visitors are redirected to sign-in.
  - Exports are refused.
  - The same generic message appears for a wrong password and an unknown email.
  - **A password alone never reaches the dashboard.**
  - First sign-in forces authenticator setup; later sign-ins require the code.
  - Sign-in rate limiting works.
- **Overview:** the numbers match the database exactly.
- **Event lifecycle:**
  - Validation errors are shown.
  - Times are stored as the correct UTC instant (11:00 CDT becomes 16:00 UTC).
  - The schedule and FAQ editors work.
  - **Ticket builder:** price validation, two tiers, an edit, a reorder, and per-tier max/quantity/sales windows, all confirmed in the database.
  - **Image upload:** stored as WebP, **EXIF removed**, set as cover; fake images are rejected.
  - **Preview** shows the draft while the public URL is still not found.
  - **Publish** makes it live with its cover; **unpublish** hides it.
  - Edits appear in the activity log.
  - **Duplicate** copies the event and its tickets as a draft.
  - **Archive and restore** both work.
- **Registrations:**
  - Attendee search and the audited CSV export work.
  - Correcting an attendee's name is saved.
- **Check-in staff:**
  - They land on Check-in and can't see Events, Registrations, Staff, Inbox, Activity log or Overview.
  - Direct links redirect them with a "forbidden" notice; sales and newsletter exports return **403**.
  - They can find a guest and check them in. The result stays visible, the scanner's identity is recorded, and a repeat check-in is refused.
- **Staff management:**
  - Adding staff works and the temporary password allows sign-in.
  - **No access is possible until MFA setup is complete.**
  - Removing access works, and both changes are audited.
- **Inbox:** messages show, and "mark handled" works.
- **Every admin page:** HTTP 200, no horizontal overflow, **no serious or critical accessibility violations**, no console errors. The phone menu works.

### Bugs found and fixed during Stage C testing
1. **Staff couldn't sign in.** Setting `[auth.email] enable_signup = false` disables email sign-in entirely in Supabase. Only the global `[auth] enable_signup = false` should be off. Fixed and recorded in `docs/RUNBOOK_PRODUCTION_SETUP.md`. Verified: staff sign-in works, and public sign-up is refused.
2. **Unticked checkboxes broke event creation.** Browsers omit unticked boxes from submissions, and validation rejected the missing field. Fixed, with a unit test that mimics a real browser submission.
3. **The order and attendee pages couldn't load linked data.** The attendees table had no direct links to orders and ticket types. Added those links.
4. **Confirmation messages disappeared.** After Publish, Archive or manual check-in, the button that held the message was replaced on refresh. Event operations now return with a lasting banner, and check-in uses a button that stays on screen.
5. **Next.js internals were being swallowed.** The public site's safe-loading helper caught Next.js's internal signals, which polluted the logs. It now passes them through (`unstable_rethrow`), and event and session data are marked request-time only. The server log is clean.
6. **Archiving a published event raised an error** instead of archiving. It now archives and unpublishes it; re-publishing while archived is blocked. The public gallery check also needed read access to the archive flag.
7. **I accidentally created a stray local test owner** (`nobody@example.com`) when running the staff script with test arguments. It was found and removed immediately; it existed only in the local database.

### Demonstration
`docs/qa/stage-c/` contains:
- **19 captioned screenshots:**
  - sign-in and the overview
  - creating an event
  - the **ticket builder with three tiers**: Early Bird $35, General $45, and a Table for 4 at $160 that admits 4 guests
  - image upload
  - preview, publish, the live public page and the public listing
  - registrations, order detail, staff and the activity log
  - check-in staff on a phone, phone ticket management and the phone overview
- **Two videos** of the same run, which are shared directly and not committed:
  - `walkthrough-desktop.webm`
  - `walkthrough-phone-checkin.webm`

### Known limitations and open items
1. **No online payments yet.** Refund tools and the "needs review" resolution arrive in **Stage D**. Sample orders were created with the same trusted database functions checkout will use.
2. **No camera QR scanning or ticket emails yet (Stage E).** Check-in is manual lookup for now.
3. **Removing staff access** takes effect on their next request, because the database checks access every time. Their sign-in session token expires within 1 hour, and that token alone grants no data.
4. **Activity-log times** are shown in Central time.
5. **The "Upcoming events" stat** counts published events; drafts are listed separately.
6. **Only tested in Chromium** at phone and desktop sizes. Safari, Firefox and real-device checks are planned for Stage F.
7. **Promotional uploads are images only**, not PDFs.
8. **The CI workflow hasn't run on GitHub yet.** It will run on the next push, provided GitHub Actions is enabled for the repository.

### Owner actions
- Review the walkthrough screenshots and videos, and decide whether to approve **Stage D: guest checkout with Stripe in test mode**. That stage needs a Stripe account, created by you and kept in test mode.

---

## Stage D: Guest checkout with Stripe (TEST mode only)

**Environment:** local workspace only. Nothing has been deployed and no live keys were used.

**Important:** this workspace's network policy **blocks Stripe** (`api.stripe.com` returns 403), and no Stripe test key is configured. So:
- All automated tests and the recorded walkthrough use a **local Stripe test double** (`tests/support/stripe-double.mts`), labeled "NOT Stripe" on every screen and caption. It implements the Stripe calls PynkPours makes and follows Stripe's test-card rules. It also sends webhooks with **genuine Stripe signatures**, created with the official SDK.
- PynkPours' requests were **contract-checked against Stripe's official `stripe-mock`**, which validates them against Stripe's published API specification.
- **The real Stripe test-card demonstration has NOT been run yet.** It is prepared as `scripts/stripe/real-test-demo.sh` and `tests/demo/stripe-real.spec.ts`, and runs once you enable access (see Outstanding).

### What was built
- **Guest checkout, no accounts:**
  - ticket selector with per-order limits
  - one details block per guest (a table for 4 gets 4 guest blocks and 4 tickets)
  - per-guest event questions
  - age confirmation and policy agreement
  - spam protection, plus rate limits per IP address and per email
- **Holds and the Stripe session:**
  - Placing an order creates a pending order and **35-minute inventory holds** atomically.
  - The Stripe Checkout Session is built from prices in the database, never the browser, with a 31-minute expiry, card payments only, and **one deduplication key per order**. A resubmitted form reuses the same order and session.
- **Webhook (the only way an order becomes paid):**
  - Signature check (raw body, 5-minute tolerance) and live-mode events refused.
  - Each event is recorded in `stripe_events` and **processed once**.
  - Handles completed, async success/failure, expired, refunded and payment-failed events.
  - The amount, currency and session are checked against the order. A mismatch is flagged for review and no tickets are issued.
  - Each ticket gets a 256-bit credential stored as a hash plus encrypted copy, and a unique short code.
- **Order page (private link, no login):**
  - Shows "Confirming your payment…" until the webhook confirms it. **Returning from Stripe is never treated as proof of payment.**
  - Lets the guest resume payment, or cancel, which expires the Stripe session and releases the seats.
- **Refunds:**
  - Admins refund chosen tickets or a whole order. Amounts are split per ticket to the cent, including tables. The Stripe request has a deduplication key, and the refund is recorded immediately.
  - Optional "put seats back on sale".
  - The order shows its refund history.
  - **"Refund all orders"** for a cancelled event.
  - Refunds made in the Stripe dashboard are reconciled automatically: full refunds invalidate every ticket, partial ones are flagged for review.
  - **Refunded tickets show "refunded" at check-in and cannot be checked in.**
- **Free tickets** are issued without payment, because there is no charge to confirm. *Flagged for your decision.*
- Existing roles, MFA enforcement, RLS and audit logging are unchanged. Refunds are audited with the acting admin.

### Test results
| Suite | Result |
|---|---|
| `npm run verify` (lint, types, unit + database tests, build, secret scan) | **Pass: 180/180** |
| Integration: webhook handler on the real local Supabase stack (14 tests) plus the Stripe contract check against `stripe-mock` (4 tests) | **Pass: 18/18** |
| Full browser suite: public site, admin, checkout; phone and desktop; fresh data | **137 passed, 0 failed** (29 skipped by design), clean server log |
| Final re-check after the workspace restart (lint, types, unit tests) | **Pass: 52/52 unit** |

### Scenarios demonstrated
All scenarios below ran in a real browser against the local test double; screenshots are in `docs/qa/stage-d/`.

| Scenario | Result |
|---|---|
| **Successful payment** (4242 4242 4242 4242), multiple tickets for different guests | No tickets before payment. After the signed webhook: paid, 3 tickets, holds converted |
| **Table purchase** (Table for 4) | 4 guest blocks, giving **4 individual tickets** with 4 unique codes |
| **Declined card** (4000 0000 0000 0002) | "Your card was declined": no charge, no tickets, seats still held. Retry with 4242 succeeds |
| **Abandoned checkout** | Guest leaves Stripe, sees "You left the payment page", cancels. The session expires, seats are released, and the old payment link shows "expired" |
| **Expired inventory hold** | Expired holds stop counting immediately (lazy expiry). The session-expiry webhook cancels the order and releases the holds |
| **Duplicate webhook delivery** | The same signed event delivered **5× concurrently** gives 5× "duplicate"; still 1 order, the same tickets, the same emails queued. Integration test: 10 concurrent deliveries plus a different event for the same session issue tickets once |
| **Forged, unsigned or stale webhooks** | All rejected (400). Nothing recorded |
| **Success URL without payment** | Shows "Confirming…"; order stays pending, no tickets |
| **Refund handling** | Admin refunds 1 ticket: Stripe refund, partially refunded, the follow-up webhook is a no-op, the ticket shows **refunded** at check-in and **cannot be checked in**. A dashboard refund of the rest reconciles to fully refunded |
| **Over-selection via a crafted link** | Refused on the server |

### Outstanding
1. **Real Stripe test-mode demonstration** (required by you before sign-off). To enable it, in the environment settings (session title bar → environment menu → Edit), then start a **new session**:
   - Allow these domains: `stripe.com`, `api.stripe.com`, `checkout.stripe.com`, `js.stripe.com`, `m.stripe.network`, `m.stripe.com`, `r.stripe.com`, `q.stripe.com`, `files.stripe.com`, `b.stripecdn.com`.
   - Add a secret environment variable `STRIPE_SECRET_KEY` holding your **test** key (`sk_test_…`). Don't paste it into chat.
   - I then run `scripts/stripe/real-test-demo.sh`. **The selectors for Stripe's hosted page are unverified until that first run.**
2. **Free-ticket orders** are issued without a webhook, because there is no payment. Please confirm that's acceptable.
3. **Ticket and confirmation emails** are queued but not yet sent (Stage E).
4. **Fees and tax** are off (your decision is pending). The refund, terms and privacy policy pages are still placeholders, and Stripe requires real ones before live mode.
5. **Production webhook endpoint setup** belongs to Stage G.
6. **The CI workflow** has been updated but hasn't run on GitHub yet.

---

## Stage D: Pre-sign-off verification (owner request, 2026-11-01)

**Status:** **NOT complete. Stage D sign-off is pending the real Stripe test-mode run.**

### 1. Implementation preserved
Stage D was committed unchanged as `4197220`. The only follow-up commit, `3da4c25`, fixes CI setup and adds tests; it doesn't change application behavior.

### 2–3. Real Stripe TEST-mode demonstration: NOT YET RUN (blocked)
In this session:
- `STRIPE_SECRET_KEY` is **not set**.
- The network policy still blocks `api.stripe.com` and `checkout.stripe.com`. Both connections fail outright.

Environment changes only take effect in a **new session**. The prepared run, `scripts/stripe/real-test-demo.sh`, covers real hosted Checkout, signed webhook delivery through the official Stripe CLI, the 4242 success and 4000 0000 0000 0002 decline cards, a table purchase, expiry, duplicate delivery of Stripe's genuine event, and refunds. **It has not been executed.** Nothing in this report claims real-Stripe results.

### 4. GitHub automated checks
| Run | Commit | Unit/DB job | Integration + e2e job | Cause |
|---|---|---|---|---|
| #1 | Stage A `6bb2dd9` | ❌ setup | n/a (job added in Stage B) | `postgresql-16` package no longer exists on GitHub's Ubuntu image |
| #2 | Stage B `d1b87bc` | ❌ setup | ❌ | Same setup failure. The e2e failure details weren't retrieved (log not reviewed) |
| #3 | Stage C `b02910b` | ❌ setup | ❌ 30 admin tests | Same setup failure. The CI database had **no demo staff accounts**, so every admin sign-in was rejected |
| #4 | Stage D `4197220` | ❌ setup | ✅ **137 passed, 0 failed**; integration and Stripe contract (`stripe-mock` on GitHub) passed | Staff accounts are now created in CI. Only the Postgres setup failure remains |
| #5 | Fix `3da4c25` | ✅ **passed**: lint, types, unit, database, build, bundle secret scan | ✅ **passed**: integration (incl. Stripe contract on `stripe-mock`) and full e2e | **First fully green CI run.** Installs the distribution's PostgreSQL; scripts detect the installed version |

**Lesson for me:** I previously reported "the CI workflow has not run yet". In fact it had run and failed on every push, and I hadn't checked. It is now part of each stage's checklist.

### 5. Free tickets: confirmed
`tests/integration/free-tickets.test.ts` (real local Supabase) and the browser test "free registration…" show that free registrations:
- go through the **same** `create_pending_order` inventory validation. With capacity 3: 2 issued, a request for 2 more is refused as sold out, 1 more is allowed, then sold out.
- receive **unique credentials** (distinct hashes and codes, encrypted credential copies).
- are **audit-logged** (`order.paid` with `{provider: "free"}`), with holds converted.
- skip Stripe entirely (no session), going straight to the order page.
- **can never be used to skip payment on a paid ticket.** Trying the free path on a paid order fails with `payment_mismatch`, and no tickets are issued.

### 6. Fees and sales tax remain disabled
- Guard tests confirm the Stripe request has no `automatic_tax`, tax rates, discounts, promo codes or fees, and charges exactly the ticket prices.
- Orders record `fee_cents = 0` and `discount_cents = 0`.
- No tax or fee code exists in the application.

### Test totals after these additions (local)
- 54 unit tests
- 128 database tests
- **22 integration tests**: webhooks, free tickets, fees/tax, and the Stripe contract
- **138 browser tests** passed (30 skipped by design), with a clean server log

### 7. Everything that must be addressed before production
**Owner content and decisions**
1. **Refund, terms and privacy policies:** these are placeholder pages, and Stripe requires real ones before live mode. (The Terms placeholder also has a typo: "terms of use *is*"; I'll fix it with the real text.)
2. **Fees and sales tax:** decisions pending; both currently off.
3. **Free tickets issued without a webhook:** please confirm you're fine with this design.
4. **Contact details:** email, phone, social links. They're hidden until supplied.
5. **About story copy:** marked PENDING.
6. **Experience formats:** the 6 formats taken from your mockups need confirming.
7. **Partnership packages and media kit.**
8. **Entrepreneurial Brunch details:** date, venue, prices, agenda, speakers.
9. **Event photography.**
10. **Logo files:** a transparent PNG or SVG, and a horizontal wordmark.
11. **Brand fonts:** confirm, or keep the proposed Playfair Display and Inter.
12. **® symbol:** confirm the marks are registered.
13. **Age and alcohol policy** for events.

**Accounts and infrastructure (Stage G, each step needs your approval)**

14. New Supabase project, applying the migrations to it, and the auth settings (`docs/RUNBOOK_PRODUCTION_SETUP.md`).
15. Vercel project and environment variables. Note that `CHECKOUT_ENABLED`, `STRIPE_API_BASE` and `PYNKPOURS_LOCAL_TEST` must not carry their local test values in production.
16. Stripe: the test-mode run (above), a production webhook endpoint, and live mode only after your approval.
17. Email provider and verified domain records (DNS).
18. Domain and DNS.
19. Supabase Pro backups or point-in-time recovery, plus a restore drill.
20. Paid plans (Vercel Pro, Supabase Pro), which require your approval.

**Engineering still to do**

21. **Stage E:** ticket and confirmation emails (queued but not sent), QR codes on ticket pages, camera scanning, staff notifications for contact messages.
22. **Stage F:** strict nonce-based security policy (CSP); true 404 status for unknown event pages; Safari, Firefox and real-device testing; accessibility and performance audit; review of `npm audit` warnings; the CI actions' Node 20 deprecation warning.
23. **Optional:** Cloudflare Turnstile bot protection.

## Stage E: Emails, QR tickets and camera check-in (local; preview verification below)

**Status:** built and tested locally against the local Supabase stack, the local Stripe test double and a new **local Resend test double** (`tests/support/resend-double.mts`, sends nothing). Checkout stays **off** in production.

### What was built
- **Email sending (Resend REST API, no SDK).** Queued messages in `email_messages` are claimed in batches by `claim_due_emails()` (row locks, so two runs never send the same message) and recorded with `mark_email_result()`. Failures back off and retry (up to 8 attempts). Each send carries an `Idempotency-Key`, so a retry never produces a duplicate email.
  - Sent straight after the guest's response (Next.js `after()`): after the Stripe webhook, after a free registration, and after a contact-form message.
  - Safety net: `/api/cron/emails` (Vercel Cron, once a day on the Hobby plan; it requires `Authorization: Bearer CRON_SECRET`).
  - Refunded or cancelled tickets are never emailed (they're recorded as skipped, not as failures).
- **Emails:** order confirmation to the buyer; one ticket per guest, with an inline QR image and the backup code (XXXX-XXXX); a "ticket resent" version; and a contact-form notification to `CONTACT_INBOX_EMAIL`, with reply-to set to the sender. All guest-supplied text is HTML-escaped; every email also has a plain-text version.
- **QR codes:** the ticket credential (43 characters, stored only as a hash plus an encrypted copy) is drawn as a QR code on the private order page and in the ticket email.
- **Camera check-in:** "Scan tickets" on each event's check-in page. It uses the phone's back camera and decodes on the device (jsQR, which works in iPhone Safari and Android Chrome). Only the scanned code goes to the server. The result is shown large and colour-coded (checked in / already checked in, with the first time / wrong event / refunded / cancelled / not a ticket), with a vibration on phones that support it. Manual search stays below it as the fallback.
- `RESEND_API_BASE` (test override) is honoured only for a localhost address and never in production unless `PYNKPOURS_LOCAL_TEST=true`.

### Bug found and fixed by the new tests
- Ticket emails failed with "ticket not found". The lookup asked the database for an attendee and ticket type through a link that doesn't exist directly (the tables use combined keys). Fixed by looking each one up on its own. The order confirmation was unaffected.

### New tests
- **Unit (`tests/unit/email.test.ts`):** template escaping and wording; the QR PNG decodes back to the exact credential; the Resend request format (idempotency key, base64 inline attachment); the test override is ignored in production and for any non-localhost address; provider errors raise so the outbox retries.
- **Browser (`tests/e2e/tickets.spec.ts`):**
  1. A free registration emails a confirmation to the buyer and a QR ticket to the guest. The QR in the email decodes to a valid credential, and both messages are recorded as sent exactly once.
  2. **Real camera path:** Chromium's fake camera is fed a video of the QR code *taken from the guest's email*. Scanning checks the guest in (verified in the database), then the same code is reported as "Already checked in" with the first check-in time.
  3. The same ticket scanned at another event's door is refused as "Ticket for a different event".
  4. The email cron endpoint refuses a missing or wrong token and works with the right one.
  5. A contact-form message notifies the inbox, with reply-to set to the sender.

### Still to verify
- On the preview, after deploy: emails arrive from the real Resend account, and scanning works on a real phone.
- iPhone Safari camera on a real device (covered in Stage F device testing).

### Test totals after Stage E (local)
- 212 unit and database tests passed
- 18 integration tests passed (4 skipped: the real-Stripe contract, which needs Stripe network access)
- **154 browser tests passed**, 40 skipped by design (desktop-only or mobile-only), **0 failed**

### Preview note
The preview Vercel project has no `RESEND_API_KEY` or `EMAIL_FROM`. Emails there stay queued (nothing is sent) until those are added. Production has them.

## Custom pages and Inbox replies (2026-11-01)

**Custom pages (owner request: "a button where I can add a policy").** Dashboard → Policies → **+ New page**. Each page has a title, a web address (`/policies/<address>`, suggested from the title), the same plain-text format as the built-in policies, **Published** (untick to hide; the page is kept), **Show a link in the site footer**, and a footer order. Pages can be deleted (with a confirmation). Published pages appear in the sitemap.
- Database (migration 1100 `custom_pages`): visitors can read published pages only. MFA-verified owners/admins can read drafts and create, edit and delete; edits are attributed to the editor; every change is in the activity log. Addresses must be unique, lowercase words and dashes.
- Tests: 4 database tests (visibility, write permissions, address rules, hide/delete plus audit trail) and a browser test (create → live page and footer link → duplicate address refused → hide → gone from site and footer → delete → activity log).

**Inbox replies (owner feedback: test contact message had no way to reply).** Each message in Dashboard → Inbox now has **Reply**. The reply is emailed to the sender from `EMAIL_FROM`, with reply-to set to the PynkPours inbox and their original message quoted underneath. It's kept on the message ("You replied · date"), and the message is marked handled.
- Database (migration 1200 `contact_replies`): owners/admins only; replies are a permanent record (no edits or deletes); audited.
- Tests: unit test for the reply email (escaping, quoting, "Re:" subject); the browser test now sends a contact message, replies from the Inbox, and checks the email the guest receives.

Both migrations were applied to the production and preview databases with Supabase MCP `apply_migration` before the code was deployed. The security advisor shows no new findings.

**Totals (local):** 217 unit/database, 18 integration, 155 browser tests passed, 0 failed.

### Owner decisions recorded
- **Newsletters** (to be built after the form builder): send to newsletter sign-ups, past buyers and guests, event interest/waitlist lists, and uploaded contacts, **only where the person has given marketing permission**. Buyers will get an opt-in checkbox at checkout. Every newsletter will carry an unsubscribe link and the PynkPours mailing address (US CAN-SPAM).

## People list, checkout opt-in, privacy update (2026-11-01)

**People (Dashboard → People, owners/admins only).** One row per email for everyone who has bought or registered, been named as a guest, checked in, joined a waitlist or get-notified list, sent a message (spam excluded) or subscribed. It's computed from the existing records, so it's always up to date. Abandoned (unpaid) checkouts are not included.
- Filters: everyone; attended; registered but didn't attend a past event; registered or bought; sent a message; waitlist/notify; can receive marketing; no marketing permission. Plus name/email search and tag filter, 50 per page.
- Person page: contact details, counts, a full history (orders, tickets, check-ins, waitlists, messages, subscribe/unsubscribe) linking to the related order, event or message, plus private notes and tags.
- **Download CSV** of the current filter. Every export is recorded in the activity log.
- **Marketing permission** comes only from the newsletter list: someone who subscribed or ticked the checkout box and hasn't unsubscribed. Everyone else is listed but marked "No marketing permission".
- Database (migration 1300): `people_notes` (MFA-verified owner/admin; edits attributed and audited). The list functions refuse anyone who isn't an MFA-verified owner/admin; the internal building blocks can't be called directly by anyone.

**Checkout opt-in.** New optional box: "Email me about future PynkPours events (optional). You can unsubscribe any time." Ticking it records the **buyer's** marketing permission (source "checkout"); guests listed on the order are not opted in.

**Privacy Policy.** The owner had replaced the drafted policy with her own text. At her request, three additions were made to her published text (production, directly in the database, checked against the exact version read so nothing else could change): a "Your Record With PynkPours" part in section 4, a sentence about the optional checkout box, and a retention line. The built-in draft was updated the same way.

**Policy display fix.** Policies pasted from a document use "1. Heading" lines and "*" bullets. Standalone, in-order numbered lines are now shown as section headings (out-of-order numbers and sentences stay as text). All three published policies use this format.

**Bugs caught by the new tests and fixed before release:** a table nested inside a table (page error); faint "None" text (contrast); saving notes was refused because the save tried to rewrite the email key.

**Tests:** 5 database tests (merging, segments including no-shows, search/tags/notes, access, audited export), 2 parsing tests, browser tests for the People list/person page/notes/tags/CSV, the checkout opt-in, and check-in staff being denied. **Totals (local): 224 unit/database, 18 integration, 158 browser tests passed, 0 failed.**

## Form builder (2026-11-01)

**Dashboard → Forms.** "+ New form" starts from the **Vendor application** template (business name, contact, phone, category, description, website, Instagram, electricity, photos, permits/insurance, agreement) or a **blank** form. New forms are drafts; nothing is public until the status is **Open**.
- **Builder:** add, edit, reorder and delete questions. Answer types: short answer, paragraph, email, phone, website, number, date, dropdown, multiple choice, checkboxes, single agree box, file upload. Each question can have help text and be required. Settings: title, web address (`/forms/<address>`), linked event, auto-close date, introduction, thank-you message, and whether to email the inbox for each response. Vendor forms let each question fill a vendor detail (used by the Vendors area, next).
- **Public form** (`/forms/<address>`): works at phone width; errors appear next to each question and answers are kept. **Uploads** (PDF, JPEG, PNG, WebP, HEIC; 10 MB each, up to 5 per question) go straight from the phone to a **private** storage bucket through one-time upload links the server issues; on submit, the server checks every file really exists with the declared type and size. Spam protection and rate limits as on the other forms.
- **After submitting:** the applicant lands on a private **status page** and is emailed a receipt with a copy of their answers and the private link. The PynkPours inbox gets a notification (reply goes to the applicant); the private link is never sent to staff.
- **Reviewing** (Forms → Responses): filter by status (New, Under review, Approved, Waitlisted, Declined). Each response shows the answers, files (downloaded through 60-second links after the role check), status with an optional message that is **emailed to the applicant** and shown on their status page, status history, private notes, a link to the person in People, and delete (removes files too, for privacy requests). **Download CSV** of all responses (audited).
- Responses appear in **People** (counted with messages, and in each person's history).
- Database (migration 1400): `forms`, `form_submissions`, `form_files`, `form_status_updates`. Visitors can read only open/closed forms, never responses or files. MFA-verified owners/admins build forms and review; changes are attributed and audited. The status-link token is stored only as a hash plus an encrypted copy (for emails). Applied to preview and production; the production bucket is private, with no public access rules.

**Tests:** 7 unit (field rules, response validation, upload path checks), 6 database (visibility, permissions, attribution/audit, outbox kinds, People integration, export audit, delete rules) and browser tests for the whole flow: build from the template and add a question → open it → a vendor applies at phone width with a real photo upload (errors first, then success) → receipt and inbox emails → owner downloads the actual JPEG, approves with a message → vendor's email and status page update → CSV; check-in staff are refused; accessibility (no serious issues) on the builder, public form, status page and response page. **Totals (local): 237 unit/database, 18 integration, 166 browser tests passed, 0 failed.**

**Known follow-ups:** uploads started but never submitted stay in the private bucket's `pending/` folder; a periodic clean-up will be added with the Vendors work.

## Free events while online payments are off (2026-11-06)

**Owner request: "I need a way to host free events."** Free events already existed (a $0 ticket type issues free tickets with QR codes, no payment), but production runs with `CHECKOUT_ENABLED=false` until Stripe is approved, and that switch also blocked $0 registrations: free events showed "registration opening soon".
- Now **free tickets can always be registered for**. Paid tickets still need online payments switched on, enforced in three places: the event page (only free tiers are offered, with "Paid ticket options are opening soon" when an event also has paid tiers), the registration page (a paid selection is refused), and the server action (checks ticket prices before any order is created, and releases any order with a total above $0 as a safety net).
- Free-only events say "Register (free)", show "Free" instead of $0.00, and don't mention payment.
- Paid-only events are unchanged: "Notify me when registration opens".

**Tests:** the browser tests now also run a second copy of the site with payments **off** (as in production): free registration end to end (tickets with QR codes), paid tiers hidden, a paid ticket refused both by link and by editing the form in the browser (no order created), paid-only events still collecting "notify me" sign-ups. **Totals (local): 237 unit/database, 18 integration, 169 browser tests passed, 0 failed.**
