# PynkPours Preview environment

A hosted environment for previewing and testing only. It holds **SAMPLE data only** and is
completely separate from production.

| Item | Value |
|---|---|
| Supabase organization | PynkPours (`qcrysnhugttxjirzvwlf`), Free plan |
| Preview project | **PynkPours Preview**, ref `msbkdryzxqznksmiftqx`, region `us-east-1`, Postgres 17 |
| Created | 2026-11-01 (owner approved project, region and name) |
| Existing project (do not touch) | `pkqzhchzmthigxqiwnqo` ("pynkpours@gmail.com's Project", us-west-2). Not modified. |
| Stripe | **Disabled** (`CHECKOUT_ENABLED=false`). No Stripe keys in preview. |
| Domain | None. `pynkpours.com` is **not** connected. |
| Vercel | Not yet created (Vercel connector was disconnected during setup). |

## Database schema

| Migration | How it was applied |
|---|---|
| 0100 foundation – 0600 security | Supabase MCP `apply_migration` (recorded in migration history) |
| 0700 rpcs, 0800 scheduling, 0900 admin | Run by the owner in the SQL Editor as one transaction, because the MCP approval prompt timed out three times. **Not recorded in `supabase_migrations`**: `list_migrations` shows only 0100–0600. |

If you later use `supabase db push` against this project, first mark 0700–0900 as applied
(`supabase migration repair --status applied 20261101000700 20261101000800 20261101000900`).

Verified after applying (2026-11-01):

- 19 tables, all with RLS enabled.
- 47 functions; 26 `public` policies; 3 `storage` policies; bucket `event-media`.
- pg_cron job `pynkpours-sweep-expired` (`*/5 * * * *`).
- `anon` cannot call `create_pending_order`; `anon` can call `get_event_ticket_options`.
- `current_staff_role()` requires an `aal2` (MFA) session.

### Advisor results (no errors)

Security:

- **INFO**: `rate_limits` and `stripe_events` have RLS enabled with no policies. This is intentional: only the server (secret key) may touch them.
- **WARN**: SECURITY DEFINER functions callable by `anon` or `authenticated`. This is intentional. Each function checks the caller's role (and MFA) internally, and the only anon-callable one is the public ticket-options reader.
  - Before production, consider moving staff RPCs to a non-exposed schema.

Performance:

- **INFO**: unused indexes (expected on an empty database) and 12 unindexed foreign keys (audit and actor columns, composite FKs).
- **WARN**: multiple permissive SELECT policies on 4 tables (public-read plus admin-read).
- All are acceptable at preview scale. Revisit before production.

## SAMPLE data

Loaded with `scripts/db/seed-preview-sample.sql`. The script refuses to run if any events exist.

- **The Entrepreneurial Brunch**: published "coming soon" page using owner-supplied brand copy only. It has no date, venue, price or speakers.
- **SAMPLE Networking Social**: on sale, with tiers General Admission, VIP and Table for 4.
- **SAMPLE Sold-Out Workshop**: sold out, waitlist.
- **SAMPLE Past Gathering**: past event.
- **SAMPLE DRAFT**: hidden draft that must never appear publicly.
- 5 SAMPLE paid orders (fictional `@example.test` guests), 9 tickets, 2 checked in, and 1 SAMPLE contact message.

The sample orders were created through the same `create_pending_order` and `fulfill_order`
RPCs that real checkout uses, with provider `stripe` and fake `cs_sample_…`/`pi_sample_…` ids.
No payment happened. Their QR credentials were random and discarded, so sample tickets can be
checked in by **manual lookup only**.

## Remaining setup (owner actions are marked)

1. **Owner (dashboard):** Authentication → Sign In / Providers. Turn off **Allow new users to sign up** and keep **Email** enabled.
2. **Owner (dashboard):** Authentication → Multi-Factor. Enable **TOTP (authenticator app)**.
3. **Owner (dashboard):** Authentication → Sign In / Providers → Email. Set minimum password length to **12** with lower/upper letters and digits.
4. **Owner (dashboard):** Authentication → Users → Add user → Create new user.
   - Email: `pynkpours@gmail.com`. Choose your own password. Do not share it.
   - Tick **Auto Confirm User**.
5. **Done 2026-11-01:** the owner created `pynkpours@gmail.com` (confirmed) in the dashboard. The owner role was then granted with one `admin_profiles` insert (role `owner`, active), and the audit log recorded it as a system action.
   - The first sign-in at `/admin` asks for the password and then enrolls the authenticator app.
6. Vercel project connected to `simplykryssie-blip/Pynk-Pours`, with Deployment Protection confirmed **before** the first deployment. Environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY` (owner pastes it into Vercel)
   - `TICKET_CREDENTIAL_KEY`, `RATE_LIMIT_SALT`, `CRON_SECRET`
   - `NEXT_PUBLIC_SITE_URL`
   - `CHECKOUT_ENABLED=false`
   - Never set `STRIPE_*`, `STRIPE_API_BASE` or `PYNKPOURS_LOCAL_TEST` here.
