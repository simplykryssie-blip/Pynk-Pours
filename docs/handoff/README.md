# PynkPours — Complete Claude Handoff Package

This package is the consolidated product, design, technical, and visual handoff for building the standalone PynkPours website and event ticketing platform.

## Start here
1. `CLAUDE_BUILD_PROMPT.md` — required first task and build instructions.
2. `PROJECT_BRIEF.md` — complete product and technical requirements.
3. `OWNER_DECISIONS.md` — decisions already made; do not reopen without a real blocker.
4. `DESIGN_SYSTEM.md` — visual identity and interface rules.
5. `CONTENT_AND_ASSET_CHECKLIST.md` — supplied logo/mockups and missing owner content.
6. `BUILD_AND_HANDOFF_PROTOCOL.md` — staged delivery and approval rules.
7. `ACCOUNT_SETUP_GUIDE.md` — new dedicated GitHub, Supabase, Vercel, Stripe, and email setup plan.
8. `ACCEPTANCE_TESTS.md` — baseline acceptance checklist.

## Included source and references
- `supabase/migrations/20261031000100_initial_pynkpours_schema.sql` — initial draft database migration. It is a starting point only; review and improve before applying it to any project.
- `assets/brand/` — supplied official PynkPours logo reference.
- `assets/design-references/` — visual references for homepage, events, event detail, registration, and admin/dashboard experiences.
- `reference-prototype/PynkPours-Website-Prototype.zip` — earlier static homepage prototype archive, for reference only.

## Important status clarification
This handoff is a specification and starter foundation, not a completed or deployed application. The SQL migration has not been approved for production, and the static prototype is not a working ticketing backend. Payment processing, inventory reservations, email delivery, QR issuance, and check-in must be implemented and tested.

## Account isolation
The owner will create brand-new dedicated GitHub, Supabase, and Vercel accounts/projects for PynkPours. Do not connect any existing MKB Financial Group, Monarch Tax Suite, or VerexaHQ resources. Do not create paid resources or deploy/apply production changes without explicit owner approval.

## Suggested use with Claude
Upload this ZIP to Claude and ask it to read every document and inspect every supplied asset. Its first response must be a technical review and staged build plan; it must not immediately deploy or apply migrations.
