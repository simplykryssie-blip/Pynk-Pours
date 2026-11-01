# START HERE — PynkPours

You are receiving one consolidated handoff package for a standalone PynkPours event and ticketing platform.

**Read the entire package before coding.** In particular, read `PROJECT_BRIEF.md`, `OWNER_DECISIONS.md`, `DESIGN_SYSTEM.md`, `ACCOUNT_SETUP_GUIDE.md`, `BUILD_AND_HANDOFF_PROTOCOL.md`, and `ACCEPTANCE_TESTS.md`. Inspect the supplied logo and all design-reference images.

Your first response must be a technical review and plan, not code or deployment. Review the initial SQL migration as draft-only and identify security/data-integrity gaps. Present a proposed application file tree and staged implementation plan. Do not ask the owner to repeat decisions documented in the package.

The owner wants brand-new dedicated GitHub, Supabase, and Vercel accounts for PynkPours. Do not connect existing business accounts/projects. Do not create paid resources, apply production migrations, connect the production domain, or enable live Stripe payments without explicit owner approval.

Build a real mobile-first application, not only static mockups. No attendee login. Each ticket gets its own secure QR credential. Stripe payment must be verified server-side before tickets are issued. Inventory reservation and check-in must be concurrency-safe. Test each stage and report exactly what was and was not completed.
