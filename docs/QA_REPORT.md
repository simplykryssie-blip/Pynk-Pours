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
