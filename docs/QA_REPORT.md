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
