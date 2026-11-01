/**
 * PynkPours site copy — the single place to edit public marketing text.
 *
 * SOURCES: Every string below comes from owner-supplied material:
 *   [P] = the approved static prototype (reference-prototype/index.html)
 *   [M] = the owner's design-reference mockups (docs/design-references/)
 *   [B] = PROJECT_BRIEF.md / OWNER_DECISIONS.md / the official logo
 * Items marked PENDING need owner confirmation before launch.
 *
 * NEVER add event dates, venues, prices, speakers, sponsors, contact details or
 * policies here unless the owner has supplied them. Event details live in the
 * database and are managed through admin.
 */

export const brand = {
  name: "PynkPours",
  tagline: "SIP • CONNECT • CREATE", // [B]
  positioning: "Where ideas meet opportunity.", // [B]
} as const;

/** PENDING owner confirmation — leave null to hide from the site. */
export const contactDetails = {
  email: null as string | null, // prototype used hello@pynkpours.com — unconfirmed
  phone: null as string | null,
  location: null as string | null,
  social: [] as { label: string; href: string }[],
};

export const nav = [
  { href: "/", label: "Home" },
  { href: "/experiences", label: "Experiences" },
  { href: "/events", label: "Events" },
  { href: "/about", label: "About" },
  { href: "/partners", label: "Partners" },
  { href: "/contact", label: "Contact" },
] as const;

export const home = {
  hero: {
    eyebrow: "A space for visionaries & doers", // [P][M]
    titleLead: "Where ideas meet", // [P][M]
    titleAccent: "opportunity.",
    body: "A gathering place for ambitious minds, meaningful conversations, and connections that move ideas forward. Come for the pour. Leave with possibility.", // [P][M]
    primaryCta: { label: "Discover what's next", href: "/events" }, // [P][M]
    secondaryCta: { label: "Our experience", href: "/experiences" }, // [M]
  },
  marquee: ["Sip", "Connect", "Create", "Collaborate", "Grow"], // [P][M]
  intro: {
    eyebrow: "More than a moment. A movement.", // [P][M]
    title: "Come together.",
    titleAccent: "Grow together.",
    body: "PynkPours creates elevated experiences where entrepreneurs, creatives, and community builders can exchange ideas, build authentic relationships, and discover what's possible when the right people are in the room.", // [P]
  },
  pillars: [
    { title: "Sip", body: "Enjoy thoughtfully curated experiences that make room for inspiration, celebration, and fresh perspectives." }, // [P]
    { title: "Connect", body: "Meet people who understand the journey, share your ambition, and open doors to new possibilities." }, // [P]
    { title: "Create", body: "Turn conversations into collaborations, ideas into action, and introductions into opportunity." }, // [P]
  ],
  signature: {
    eyebrow: "The signature experience", // [P][M]
    title: "The Entrepreneurial Brunch", // [B]
    lead: "Big ideas deserve the right room.", // [P][M]
    body: "Our signature entrepreneurial gathering brings business owners, emerging founders, and creative thinkers together for conversation, connection, practical insight, and intentional networking.", // [P]
    note: "Event date, venue, ticket details, and speaker announcements will be shared here as they are confirmed.", // [P]
    /** Permanent event page slug (created by the owner in admin). */
    slug: "entrepreneurial-brunch",
  },
  newsletter: {
    eyebrow: "Stay in the circle", // [P][M]
    title: "Your next connection could change everything.", // [P][M]
    body: "Be the first to hear about upcoming gatherings, special experiences, speaker announcements, and opportunities to connect with the PynkPours community.", // [P][M]
  },
} as const;

export const experiences = {
  eyebrow: "Curated gatherings. Real connections. Lasting opportunities.", // [M]
  title: "The PynkPours Experience", // [M]
  introEyebrow: "Our experiences", // [M]
  introTitle: "More than events — strategic gatherings", // [M]
  introBody: "Each PynkPours experience is intentionally designed to inspire, connect, and create real opportunities for personal and professional growth.", // [M]
  // PENDING: experience formats shown in the owner's mockups. Confirm which are offered.
  formats: [
    { title: "Entrepreneurial Brunch", body: "A signature gathering for visionaries, founders, and business builders." },
    { title: "Networking Socials", body: "Meaningful connections in a relaxed, upscale setting." },
    { title: "Speaker Series", body: "Industry insights, real talk, and practical strategies." },
    { title: "Workshops & Labs", body: "Hands-on learning with actionable takeaways." },
    { title: "Collaborative Experiences", body: "Partnered events that spark innovation and growth." },
    { title: "Special Activations", body: "Seasonal, themed, and exclusive PynkPours experiences." },
  ],
  closing: "Different experiences. A greater purpose.", // [M]
} as const;

export const about = {
  eyebrow: "The heart behind the pour.", // [M]
  title: "About PynkPours",
  storyEyebrow: "Our story", // [M]
  storyTitle: "Purpose, people & possibility", // [M]
  // PENDING: final brand story copy from owner (CONTENT_AND_ASSET_CHECKLIST.md).
  story: "PynkPours was created to bring ambitious people together — entrepreneurs, business owners, creatives, and community builders — in a space that feels elevated, intentional, and empowering.", // [M]
  mission: { title: "Our mission", body: "To create curated experiences that inspire connection, collaboration, and opportunity." }, // [M]
  vision: { title: "Our vision", body: "A thriving community where ideas are shared, partnerships are formed, and people grow together." }, // [M]
} as const;

export const partners = {
  eyebrow: "Align your brand with a movement that empowers, connects, and creates opportunity.", // [M]
  title: "Partner with PynkPours", // [M]
  introEyebrow: "Sponsorship & partnership opportunities", // [M]
  introTitle: "Be part of the experience", // [M]
  introBody: "PynkPours partners with brands, organizations, and entrepreneurs who share our commitment to community, collaboration, and growth.", // [M]
  benefits: [
    { title: "Brand exposure", body: "Showcase your brand to a highly engaged audience." }, // [M]
    { title: "Meaningful connections", body: "Build relationships with business owners, creatives, and decision-makers." }, // [M]
    { title: "Community impact", body: "Support a platform that creates opportunities and drives growth." }, // [M]
  ],
  // PENDING: partnership packages / media kit from owner.
  inquiryTitle: "Start a partnership conversation",
  inquiryBody: "Tell us about your brand or organization and how you'd like to be involved. A member of the PynkPours team will follow up.",
} as const;

export const contact = {
  eyebrow: "Let's connect.", // [M]
  title: "Contact PynkPours", // [M]
  formEyebrow: "Get in touch", // [M]
  formTitle: "We'd love to hear from you.", // [M]
  body: "Have a question, partnership inquiry, or event request? Send us a message and a member of the PynkPours team will be in touch.", // [M]
} as const;
