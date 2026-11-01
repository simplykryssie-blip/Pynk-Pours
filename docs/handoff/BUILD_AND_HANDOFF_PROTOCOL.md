# PynkPours — Build and Handoff Protocol

## First response from Claude
Before coding, Claude should provide the inventory, migration/security review, route/component plan, proposed file tree, stage plan, and truly blocking owner questions. The detailed required response is in `CLAUDE_BUILD_PROMPT.md`.

## Development stages
1. Review and architecture; audit and revise the draft SQL.
2. Public responsive website and dynamic event pages.
3. Private admin authentication, event CRUD, ticket tier management.
4. Inventory reservation, guest checkout, Stripe test-mode payments and signed idempotent webhooks.
5. Individual digital tickets, secure QR credentials, transactional email, mobile check-in and manual lookup.
6. Security, accessibility, responsive, integration, concurrency, and end-to-end QA.
7. New-account setup, preview deployment, owner acceptance, then production launch approval.

## Required progress report at every stage
- Exact files created/changed.
- Commands and tests actually run.
- Pass/fail results and test coverage where available.
- Known limitations and unresolved risks.
- Any owner action required.
- Whether changes are local, preview, or production.

## Definition of done
A feature is not complete because a page renders. It is complete only when its real data flow, authorization, error states, and relevant tests pass. Do not use hardcoded demo values as live data. Do not claim a provider is connected unless verified in the provider and application.

## Owner approval required
Get explicit approval before creating paid resources, applying production migrations, changing billing, inviting external collaborators, connecting a production domain, enabling live Stripe payments, or deploying to production.
