# PynkPours

Event and ticketing platform for **PynkPours** (SIP • CONNECT • CREATE).

**Status:** Stage A (foundation), local development only. Not deployed. See `docs/STAGE_A_TECHNICAL_REVIEW.md` for the architecture and plan, and `docs/QA_REPORT.md` for test evidence.

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

Requirements: Node 22+, Postgres 16 binaries (for database tests).

```bash
npm install
cp .env.example .env.local   # fill in values when accounts exist
npm run dev                   # http://localhost:3000
```

## Tests

```bash
npm run test:unit   # pure TypeScript unit tests
npm run test:db     # starts a disposable local Postgres on 127.0.0.1:54329,
                    # applies supabase/tests/supabase-local-shim.sql + all migrations,
                    # then runs security/RLS, checkout, lifecycle, concurrency
                    # and backup/restore tests as the real Supabase API roles
npm test            # both
npm run verify      # lint + typecheck + tests + build + client-bundle secret scan
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
src/app/                  Next.js routes
src/lib/                  shared utilities (money, timezone, CSV)
src/server/               server-only code (env, credentials, …)
supabase/migrations/      schema, RLS, trusted RPCs, scheduling
tests/unit, tests/db      test suites
```
