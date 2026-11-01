# PynkPours — New Account Setup Guide

The owner wants brand-new dedicated accounts for PynkPours. Do not connect existing accounts or projects associated with other businesses.

## Account order

1. **GitHub** — create the new owner-controlled account, enable two-factor authentication, and create a private repository named `pynkpours` (or `pynkpours-platform`). The owner must retain owner/admin access.
2. **Supabase** — create the new account and a dedicated project named `pynkpours-production`. Choose a strong database password and save it in a password manager. Keep the project region appropriate for the primary audience and latency; confirm region choice with owner before project creation if uncertain. Do not apply the supplied draft migration until it has been reviewed and approved.
3. **Vercel** — create the new account and connect only the new PynkPours GitHub repository. Start with a Preview deployment; do not assign the production domain until QA is approved.
4. **Stripe** — create or designate a PynkPours-owned Stripe account if one does not already exist for this brand. Begin in test mode. Do not enable live payments until owner approval and full acceptance testing.
5. **Email provider** — select a transactional email provider during implementation. Verify a sending domain and configure secrets server-side only.

## Security and ownership checklist
- Owner controls recovery email, phone, MFA, billing, and account recovery.
- Use unique strong passwords and MFA on every provider.
- Do not share passwords or paste secret keys into chat, source files, screenshots, or commits.
- Claude/developer should request only the minimum scoped access needed, and owner should grant it directly through each provider's access controls.
- Keep all credentials in provider environment-variable settings or a password manager.
- Never commit `.env`, service-role keys, Stripe secret keys, webhook signing secrets, database passwords, or email API keys.
- Use separate development/preview and production environment variables.
- Do not connect any pre-existing MKB, Monarch, or Verexa project.

## Environment variable inventory (names only)
The developer should create `.env.example` with placeholders only, based on the actual chosen SDK versions and implementation. Expected categories include:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or publishable key name required by the selected Supabase setup)
- `SUPABASE_SERVICE_ROLE_KEY` (server only; never `NEXT_PUBLIC_`)
- `STRIPE_SECRET_KEY` (server only)
- `STRIPE_WEBHOOK_SECRET` (server only)
- `NEXT_PUBLIC_SITE_URL`
- transactional email API key (server only)
- verified sender/from address
- any required QR/ticket signing or encryption key (server only)

The exact variable names must match the implementation and current provider SDKs. Never place actual values in this guide.

## Go-live gates
Do not connect the custom domain, switch Stripe to live mode, or apply production migrations until the owner has approved:
- database/RLS/security review;
- test-mode checkout and webhook results;
- inventory/concurrency tests;
- ticket email delivery and resend behavior;
- QR validation and simultaneous check-in tests;
- backup/recovery and admin access plan;
- terms, refund, privacy, and contact content.
