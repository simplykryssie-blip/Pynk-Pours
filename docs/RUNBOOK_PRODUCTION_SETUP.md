# PynkPours — Production Setup Runbook (draft)

**Status:** Draft notes collected during Stages A–C. Nothing here has been carried out on any hosted account. Every step needs **owner approval** and is done **in your own accounts**. Never paste keys into chat.

## Supabase project settings (Stage G)
These match what the local stack (`supabase/config.toml`) was tested with:

| Setting (Supabase dashboard) | Value | Why |
|---|---|---|
| Authentication → Sign In / Providers → **Allow new users to sign up** | **Off** | Staff are created only by the owner (Staff page) or `scripts/create-staff.mts` |
| Authentication → Sign In / Providers → **Email** provider | **On** (keep enabled) | Staff sign in with email and password. ⚠️ In local testing, turning off *email* sign-ups disabled email sign-in completely. Use only the global switch above. |
| Authentication → Multi-Factor → **TOTP (authenticator app)** | **Enabled** | Required for every staff member; the database refuses staff permissions without it |
| Authentication → Policies → **Minimum password length** | **12**, requiring lowercase, uppercase and digits | Matches the in-app policy |
| Storage | Bucket `event-media` is created by migration `…0900_admin.sql` | Public read, admin-only write, 5 MB, WebP/JPEG/PNG only |
| Database → Extensions → `pg_cron` | Enabled (the migration schedules the 5-minute sweep) | Expires abandoned checkouts and prunes rate-limit rows |

## First owner account
After the migrations are applied (with approval), run this on **your own computer**, with the production URL and secret key in a local env file that is **never committed**:

```bash
npx tsx --env-file=.env.production.local scripts/create-staff.mts \
  --email you@yourdomain --name "Your Name" --role owner --allow-remote
```

The script prints a temporary password once. Sign in at `/admin/login`, scan the QR code with your authenticator app, then change the password under **My account**. Add other staff from the **Staff** page.

## Remaining items (to complete in Stage G)
Vercel project, environment variables, Stripe (test, then live), email domain, DNS, backups and PITR, and a restore drill. See `docs/STAGE_A_TECHNICAL_REVIEW.md` §3.13 and `docs/handoff/ACCOUNT_SETUP_GUIDE.md`.
