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
| Vercel | Project **pynkpours-preview** (`prj_wAHEJxcQX8dlgWquhxoerprHudo4`) on team PynkPour (`team_o8KHxEPN0V1JqHycG9m41kNK`, Hobby), linked to `simplykryssie-blip/Pynk-Pours`, Node 22.x. **Vercel Authentication on ALL deployments** (`ssoProtection.deploymentType = all`), so only signed-in team members can open it. No custom domain. |

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

Steps 1–3 were confirmed done by the owner on 2026-11-01: public sign-ups off, TOTP on, and the password policy set.


1. **Owner (dashboard):** Authentication → Sign In / Providers. Turn off **Allow new users to sign up** and keep **Email** enabled.
2. **Owner (dashboard):** Authentication → Multi-Factor. Enable **TOTP (authenticator app)**.
3. **Owner (dashboard):** Authentication → Sign In / Providers → Email. Set minimum password length to **12** with lower/upper letters and digits.
4. **Owner (dashboard):** Authentication → Users → Add user → Create new user.
   - Email: `pynkpours@gmail.com`. Choose your own password. Do not share it.
   - Tick **Auto Confirm User**.
5. **Done 2026-11-01:** the owner created `pynkpours@gmail.com` (confirmed) in the dashboard. The owner role was then granted with one `admin_profiles` insert (role `owner`, active), and the audit log recorded it as a system action.
   - The first sign-in at `/admin` asks for the password and then enrolls the authenticator app.
6. **Done 2026-11-01:** Vercel project created with protection on all deployments before any deployment. Environment variables (Production + Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY` (pasted into Vercel by the owner; never shared in chat)
   - `TICKET_CREDENTIAL_KEY`, `RATE_LIMIT_SALT`, `CRON_SECRET`
   - `NEXT_PUBLIC_SITE_URL`
   - `CHECKOUT_ENABLED=false`
   - Never set `STRIPE_*`, `STRIPE_API_BASE` or `PYNKPOURS_LOCAL_TEST` here.

## Notes

- `TICKET_CREDENTIAL_KEY`, `RATE_LIMIT_SALT` and `CRON_SECRET` were generated for the preview and passed through the assistant session. They are **preview-only**. Production must use new values generated by the owner.
- Every push to `master` deploys automatically. All deployments require Vercel sign-in.
- Recommended: limit the Vercel GitHub app to the `Pynk-Pours` repository only (GitHub → Settings → Applications → Vercel).
- 2026-11-01: the owner briefly created a second Vercel project (`pynk-pours`, no environment variables) and attached `pynkpours.com` and `www.pynkpours.com` to it publicly. The owner then deleted it. `pynkpours.com` stays registered in the team but is attached to no project. Its GoDaddy DNS still mixes old GoDaddy A records with Vercel's; fix this at launch.
- 2026-11-01: the owner asked for **admin.pynkpours.com** on the preview. It is attached to `pynkpours-preview`, with a GoDaddy CNAME `admin` → `173df7e0fe575be8.vercel-dns-017.com`, and Vercel reports it correctly configured. `ADMIN_HOST=admin.pynkpours.com` is set for Production and Preview. Staff sign-in is at https://admin.pynkpours.com, and `/admin` on other preview addresses redirects there. Vercel sign-in (all deployments) still applies to this domain. At launch, move the domain and `ADMIN_HOST` to the production project.
