# PynkPours — Design System

## Brand
- Name: PynkPours
- Tagline: SIP • CONNECT • CREATE
- Supporting line: Where ideas meet opportunity.

## Visual language
- Primary canvas: near-black / rich black.
- Secondary surfaces: warm cream and soft blush.
- Accent: refined metallic-gold details used sparingly; blush/pink for emphasis and CTAs.
- Headlines: elegant editorial serif.
- Body/UI: clean sans-serif with strong legibility.
- Layout: minimal, confident, editorial, spacious, mobile-first.
- Use high-quality event photography where supplied. Keep text contrast strong over images.

## Suggested starting tokens
These are implementation starting points, not immutable brand standards. Tune against the official logo asset when supplied.
- `--pp-black: #0B0B0B`
- `--pp-charcoal: #161216`
- `--pp-cream: #F7F1ED`
- `--pp-blush: #E7B7C9`
- `--pp-pink: #D994B2`
- `--pp-gold: #C8A45D`
- `--pp-muted: #B8AEB2`

Avoid mustard/orange/brown-looking gold. Gold should read metallic/refined, not flat mustard. Do not add decorative ribbons, swooshes, ornate geometric frames, or luxury-office props.

## Components
- Header: logo, primary navigation, visible Events/Experiences CTA; compact mobile menu.
- Buttons: high-contrast, clear labels, accessible focus states, distinct primary/secondary treatments.
- Event cards: strong image, date, title, short teaser, clear action.
- Ticket selector: readable ticket name, description, price, availability/sale status, quantity control.
- Forms: concise, labeled, validation messages adjacent to fields.
- Admin UI: functional and restrained; prioritize clarity over decorative brand effects.

## Responsive behavior
- Design mobile first.
- Avoid horizontal overflow.
- Ensure ticket selection, checkout, and QR scanning work on common phone screens.
- Admin check-in must support phone camera permissions and provide manual lookup fallback.

## Content integrity
Use the official PynkPours logo when supplied. Do not fabricate event details or present sample data as real. Label all sample content clearly in development.
