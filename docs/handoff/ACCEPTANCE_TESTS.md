# PynkPours — MVP Acceptance & QA Checklist

A feature is not complete until its relevant checks pass. Record test commands, results, and evidence in the handoff.

## Public website
- [ ] Home, About, Events, Event Detail, Partners, and Contact routes render on mobile and desktop.
- [ ] Only published events appear publicly.
- [ ] Draft, cancelled, and unpublished events cannot be purchased.
- [ ] Event details, timezone, ticket options, FAQs, and registration state are event-specific.
- [ ] No invented event data appears in production.
- [ ] Forms validate input and protect against spam/abuse.

## Ticket configuration
- [ ] Event can have one fixed-price ticket.
- [ ] Event can have multiple custom ticket types.
- [ ] VIP is optional and can be omitted entirely.
- [ ] Each ticket type supports price, capacity, max per order, sale window, active/paused/closed state, and ordering.
- [ ] Sale windows and capacity are enforced server-side.
- [ ] Sold-out behavior supports either Sold Out or optional waitlist per event.
- [ ] Concurrent checkout attempts cannot oversell inventory.
- [ ] Expired/abandoned reservations release inventory correctly.

## Guest checkout and payment
- [ ] Guest can checkout without creating an account.
- [ ] One order can contain multiple tickets assigned to different attendees.
- [ ] Server recalculates all prices and totals; client values are not trusted.
- [ ] Checkout uses Stripe test mode during development.
- [ ] Invalid or failed payments do not issue tickets.
- [ ] A browser success redirect alone does not mark an order paid.
- [ ] Stripe webhook signature is verified.
- [ ] Duplicate webhook delivery is idempotent.
- [ ] Full and partial refund behavior updates order/ticket validity appropriately.
- [ ] Abandoned and failed checkout states are handled.

## Ticket credentials and email
- [ ] Each attendee ticket has a separate cryptographically random credential.
- [ ] QR does not contain personal information or predictable IDs.
- [ ] Only a secure hash of the credential is stored.
- [ ] Ticket is issued only after verified payment.
- [ ] Confirmation and ticket email are sent once per successful order/ticket.
- [ ] Email failure is logged and can be retried/resend by an authorized admin.

## Check-in
- [ ] Valid paid ticket for correct event is accepted.
- [ ] Second scan returns Already Checked In and does not create a second accepted check-in.
- [ ] Invalid, wrong-event, refunded, and cancelled tickets are rejected with clear messages.
- [ ] Concurrent scans are race-safe; at most one succeeds.
- [ ] Scan timestamp and authorized scanner/admin are recorded.
- [ ] Manual attendee/ticket lookup works.
- [ ] Ticket type is visible to authorized check-in staff.
- [ ] Attendance totals and recent check-ins update correctly.

## Admin and security
- [ ] Admin routes require authentication.
- [ ] Non-admin authenticated users cannot manage events or view attendee/order data.
- [ ] Anonymous users can only read published event content and available public ticket details.
- [ ] No public write access to orders, attendees, tickets, or check-ins.
- [ ] Service-role and Stripe secrets never appear in client bundles, logs, or repository.
- [ ] RLS and server authorization tests cover private tables and mutations.
- [ ] Admin creation is performed through a trusted setup process, not public signup or client-side profile writes.

## Deployment readiness
- [ ] `.env.example` contains variable names only.
- [ ] Fresh-project setup instructions are complete.
- [ ] Migrations reviewed and tested against a disposable/test Supabase project.
- [ ] Stripe test-mode end-to-end purchase and refund tests pass.
- [ ] Mobile camera permission and scanner tests pass on actual devices.
- [ ] Production deployment requires owner approval.
- [ ] Custom domain and email sender are configured and verified before launch.
