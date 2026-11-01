# Instructions for Claude — PynkPours Build

You are helping build **PynkPours**, a standalone event and ticketing website. Read `PROJECT_BRIEF.md`, `DESIGN_SYSTEM.md`, `ACCEPTANCE_TESTS.md`, and the supplied Supabase migration before making changes.

## First task: inspect and plan; do not immediately deploy
1. Inspect the supplied files and report what is present, missing, unsafe, or incomplete.
2. Review the SQL migration for correctness, Supabase RLS behavior, privilege boundaries, and production readiness. Treat it as a draft, not approved production SQL.
3. Propose a staged implementation plan with a file tree and clear deliverables.
4. Do not create/connect external accounts, deploy, run production migrations, purchase services, or use live Stripe credentials. The owner will create new dedicated GitHub, Supabase, and Vercel accounts with guidance later.
5. Do not use or connect any existing projects belonging to MKB Financial Group, Monarch Tax Suite, or VerexaHQ.

## Build rules
- Build a real working application, not just static mockups.
- Use Next.js and TypeScript, Supabase for Postgres/Auth, Stripe for payments, and Vercel for hosting unless you identify a concrete compatibility issue and explain it before changing direction.
- Keep public guest checkout account-free. Only administrators authenticate.
- Use server-side authorization for every sensitive operation. Never trust client-supplied prices, totals, ticket status, or payment status.
- Never expose Supabase service-role credentials, Stripe secret keys, or webhook secrets to the browser.
- Verify Stripe webhook signatures and make webhook processing idempotent.
- Do not issue tickets until payment is verified.
- Use unique random QR credentials per ticket, store only a secure hash, and validate server-side.
- Implement race-safe inventory reservation and atomic check-in. Test concurrent requests.
- Use real database-backed behavior. Do not use hardcoded demo records as if they were production data.
- Include accessible form labels, loading/error/success states, validation, and mobile-responsive layouts.
- Do not invent PynkPours event dates, locations, prices, speakers, sponsor names, or official logo artwork.
- Keep membership and attendee accounts out of MVP.
- Provide `.env.example` without secrets, setup instructions, migration instructions, and a test plan.
- Do not commit secrets or real personal data.

## Recommended implementation sequence
### Stage A — Review and architecture
Audit the initial migration, define app routes/components, data model adjustments, security model, and environment variable list. Deliver findings and plan for approval.

### Stage B — Public website
Implement the responsive public shell and pages: Home, About, Experiences/Events, dynamic Event Detail, Partners/Sponsorships, Contact. Use brand styling from `DESIGN_SYSTEM.md`. Use clearly marked content placeholders only where owner-supplied copy/assets are missing.

### Stage C — Admin and event management
Implement admin-only authentication, dashboard, event CRUD, publish/draft controls, and flexible per-event ticket configuration. Guests must not be able to access admin routes or private data.

### Stage D — Guest checkout and payments
Implement ticket selection, inventory reservation, attendee-per-ticket forms, Stripe Checkout, signed/idempotent webhooks, order lifecycle, and payment failure/expiry handling. Use Stripe test mode only.

### Stage E — Ticket delivery and check-in
Generate individual secure QR credentials, email each ticket, implement server-side validation, atomic check-in, duplicate/invalid/refunded/wrong-event responses, manual lookup, and scan history.

### Stage F — QA and handoff
Run unit, integration, security/RLS, and end-to-end tests. Test concurrency and webhook duplication. Provide exact setup/deploy steps. Do not deploy to production until the owner approves and the new accounts are connected.

## Required first response
Before coding, return:
1. Inventory of supplied files.
2. Migration review findings and risks.
3. Proposed application file tree.
4. Exact staged plan.
5. Decisions or owner-provided assets still needed.

Do not ask the owner to repeat requirements already in the brief. Ask only for genuinely blocking information.
