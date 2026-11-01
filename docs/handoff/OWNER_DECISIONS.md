# PynkPours — Confirmed Product Decisions

This document consolidates decisions already made by the owner. Do not reopen these decisions unless a genuine technical blocker exists.

## Brand
- Brand name: PynkPours.
- Brand line: SIP • CONNECT • CREATE.
- Positioning: Where ideas meet opportunity.
- Visual direction: luxury black, blush/pink, metallic gold, warm cream; editorial serif headlines and clean sans-serif supporting typography.
- Use the supplied official logo artwork in `assets/brand/`. It is a supplied raster reference; do not recreate or substitute it. Ask the owner for a transparent/vector version only if needed for a specific implementation.

## Website
- Mobile-first, responsive public website.
- Pages: Home, About, Experiences/Events, dynamic event detail, Partners/Sponsorships, Contact.
- Entrepreneurial Brunch should have a permanent event page once verified event details are supplied.
- Event content must be editable through admin rather than hardcoded.

## Ticketing
- Flexible ticket configuration per event.
- Support a single fixed-price ticket or any combination of custom ticket tiers.
- Early Bird, General Admission, VIP, and custom labels are examples, not mandatory tiers.
- VIP is optional for every event.
- Each tier has its own price, quantity/capacity, sale start/end, max per order, active state, and display order.
- Each event chooses its own sold-out behavior: show Sold Out or offer a waitlist. Waitlist is not required for MVP.
- Guest checkout only. No attendee accounts, passwords, or attendee profiles.
- One order may contain multiple tickets, and each ticket may be assigned to a different attendee.

## Ticket delivery and event operations
- One secure, unique QR credential per ticket, not per order.
- Phone-friendly web check-in page/PWA approach; no native mobile app required for launch.
- Multiple authorized devices should be able to scan simultaneously against shared server-side state.
- Atomic check-in prevents duplicate acceptance.
- Manual attendee lookup is required as a backup.

## Platform and ownership
- Build a standalone PynkPours platform.
- Owner will create brand-new dedicated GitHub, Supabase, and Vercel accounts for PynkPours.
- Do not use or connect MKB Financial Group, Monarch Tax Suite, or VerexaHQ projects/accounts.
- Stripe is the payment provider; start in test mode.
- The owner keeps ownership of accounts, source code repository, database, payment account, and production deployment.

## Future, not MVP
- The PynkPours Society membership concept is a future phase only.
- Design data boundaries so membership can be added later, but do not build member login, member billing, loyalty, or rewards in this launch.

## Content that must come from the owner
Do not fabricate any of the following: event dates/times/timezones, venue/address, ticket prices/capacities, speakers, sponsors, policies, contact details, legal entity details, or event-specific FAQs. Use unpublished draft placeholders until supplied.
