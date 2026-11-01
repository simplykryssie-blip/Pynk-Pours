# PynkPours

Event and ticketing platform for **PynkPours** (SIP • CONNECT • CREATE).

**Status:** Stage D (guest checkout, Stripe TEST mode) built and tested locally against a Stripe test double; the real Stripe test-card run is pending network access + test keys. **Not deployed.** See `docs/STAGE_A_TECHNICAL_REVIEW.md` for the architecture and plan, and `docs/QA_REPORT.md` for test evidence for each stage.

## Stack
- Next.js 16 (App Router) + React 19 + TypeScript (strict) + Tailwind CSS 4
- Supabase: Postgres, Row Level Security, Auth (staff only), Storage
- Stripe Checkout (test mode until the owner approves go-live)
- Transactional email (Resend recommended)
- Hosting: Vercel

## Ground rules
- Guests never create accounts. Only staff (owner, admin, check-in) sign in.
- All prices, totals, inventory and payment state are decided **on the server and in the database**, never by the browser.
- Secrets live only in environment variables. Never commit `.env*` files; never prefix a secret with `NEXT_PUBLIC_`.
- No invented event details, prices, speakers or sponsors. Test fixtures are labeled `SAMPLE — NOT REAL`.
- Production migrations, deployments, the domain and live payments all require explicit owner approval.

## Local development

Requirements: Node 22+, Docker (for the local Supabase stack), Postgres 16 binaries (for database tests).

```bash
npm install
npm run supabase:start        # local Supabase in Docker; applies supabase/migrations
npm run seed:sample           # LOCAL ONLY sample events (labelled SAMPLE — not real)
cp .env.example .env.local    # then copy the local API URL + publishable/secret keys
                              # from `npx supabase status`, and set RATE_LIMIT_SALT
npm run dev                   # http://localhost:3000
```

The local Supabase keys are Supabase's public **development** keys and only work against
your own machine. Hosted keys go in Vercel's environment settings, never in files.

## Admin dashboard (`/admin`)
Staff-only. Requires a password **and** an authenticator-app code (TOTP). The MFA requirement is enforced by the database itself, not just the website.

| Role | Can do |
|---|---|
| Owner | Everything, including adding/removing staff and resetting authenticators |
| Admin | Events, tickets, images, registrations, sales, exports, inbox, activity log |
| Check-in staff | Check-in only: find guests and check them in. No sales, orders or editing |

Local demo data and staff (LOCAL ONLY):
```bash
scripts/db/reset-local-demo.sh   # reset local DB + SAMPLE events/orders + demo staff
# owner@pynkpours.test / DemoOwner-Local-2026   (owner)
# door@pynkpours.test  / DemoDoor-Local-2026    (check-in staff)
# First sign-in shows a QR code: scan it with an authenticator app.
```
Create real staff with `scripts/create-staff.mts` (see `docs/RUNBOOK_PRODUCTION_SETUP.md`), or from **Staff** in the dashboard.

## Editing site copy
All marketing text lives in `src/content/site.ts`, and each block notes its source.
Event details (dates, venues, prices, agenda, FAQs, speakers) are **not** in code. They come
from the database and are managed through the admin dashboard (Stage C).

## Tests

```bash
npm run test:unit   # pure TypeScript unit tests
npm run test:db     # starts a disposable local Postgres on 127.0.0.1:54329,
                    # applies supabase/tests/supabase-local-shim.sql + all migrations,
                    # then runs security/RLS, checkout, lifecycle, concurrency
                    # and backup/restore tests as the real Supabase API roles
npm test            # both
npm run verify      # lint + typecheck + tests + build + client-bundle secret scan

# End-to-end (needs: npm run supabase:start && npm run seed:sample && npm run build)
npm run test:e2e    # Playwright at 375px (phone) and 1280px (desktop): public site
                    # and admin (real password + TOTP sign-in), accessibility (axe)
npx playwright test -c playwright.demo.config.ts   # recorded, captioned admin walkthrough
```

The database tests refuse to run against anything except `127.0.0.1`.

## Database
- `supabase/migrations/`: the reviewed replacement schema. **Not applied to any hosted project.**
- `docs/reference/ORIGINAL_DRAFT_…sql`: the original handoff draft, kept unchanged for reference.
- `supabase/tests/supabase-local-shim.sql`: **local test harness only.** Never apply it to Supabase.

## Project layout
```
docs/                     review, QA report, handoff package, design references
public/brand/             supplied official logo (unaltered)
scripts/db/local-pg.sh    disposable local Postgres for tests
scripts/check-client-bundle.sh
src/app/(site)/           public pages (home, about, experiences, events, partners, contact, policies)
src/components/           UI: site shell, events, forms
src/content/site.ts       editable marketing copy (sourced from owner material)
src/lib/                  shared utilities (money, timezone, CSV)
src/server/               server-only code (env, Supabase clients, data access, form actions)
supabase/migrations/      schema, RLS, trusted RPCs, scheduling
tests/unit, tests/db      unit + database test suites
tests/e2e                 Playwright end-to-end tests
```

## Checkout & payments (Stage D)
- Guest checkout, no accounts. Each guest gets their own ticket; a table admits N guests and issues N tickets.
- Tickets are issued **only** by verified, signed Stripe webhooks (`/api/stripe/webhook`). Processing is idempotent.
- Local tests use `tests/support/stripe-double.mts`, a **local Stripe test double (not Stripe)**. The real test-mode demo is `scripts/stripe/real-test-demo.sh`; it needs Stripe network access and a `sk_test_` key in the environment.
