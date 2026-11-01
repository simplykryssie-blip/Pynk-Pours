/**
 * PynkPours policies. Drafted for the owner on 2026-11-01 from how the site actually
 * works (Stripe payments, no advertising trackers, hashed IPs for spam protection,
 * guest checkout with no accounts). Owner review — ideally with a Louisiana attorney —
 * is recommended before relying on them. Edit the text here; pages update automatically.
 */
import { contactDetails } from "./site";

import { policyToText, type PolicyBlock } from "@/lib/policy-text";

/** Shape of the built-in drafts below (converted to editable text for the dashboard). */
interface DraftPolicy {
  title: string;
  updated: string;
  intro: string[];
  sections: { heading: string; body: string[]; list?: string[] }[];
}

const EMAIL = contactDetails.email ?? "hello@pynkpours.com";
const UPDATED = "November 1, 2026";

const privacyPolicy: DraftPolicy = {
  title: "Privacy Policy",
  updated: UPDATED,
  intro: [
    `PynkPours ("PynkPours," "we," "us") hosts events for entrepreneurs, creatives and professionals in Lake Charles, Louisiana and beyond. This policy explains what personal information we collect through pynkpours.com, how we use it, and the choices you have.`,
    "We collect only what we need to run our events and answer your messages. We do not sell your personal information.",
  ],
  sections: [
    {
      heading: "Information we collect",
      body: ["We collect information you give us directly:"],
      list: [
        "Contact and partnership forms: your name, email address, subject and message.",
        "Newsletter: your email address.",
        "\"Get notified\" and waitlist requests: your name, email address and how many tickets you're interested in.",
        "Ticket purchases: the purchaser's name, email address and (optionally) phone number, and the name, email address and (optionally) phone number of each guest, plus answers to any questions an event asks.",
        "At events: a record of when each ticket was checked in.",
        "At checkout: whether you chose to receive emails about future PynkPours events.",
      ],
    },
    {
      heading: "Payment information",
      body: [
        "Payments are processed by Stripe. Your card details go directly to Stripe and are never stored on our systems. We receive a confirmation of payment, the amount, and limited details such as the last four digits of the card. Stripe's use of your information is governed by the Stripe Privacy Policy (stripe.com/privacy).",
      ],
    },
    {
      heading: "Information collected automatically",
      body: [
        "To protect our forms and checkout from spam and abuse, we use your IP address to apply rate limits. We store only a one-way scrambled (hashed) version of it, never the address itself, and these records are deleted within a day.",
        "We use only the cookies needed for the site to work, such as keeping our staff securely signed in. We do not use advertising cookies, and we do not use third-party tracking or analytics that follow you across other websites.",
      ],
    },
    {
      heading: "How we use your information",
      body: ["We use your information to:"],
      list: [
        "issue and deliver tickets, confirmations and event updates;",
        "check guests in at the door;",
        "process refunds and respond to questions;",
        "send our newsletter and event announcements if you agreed to receive them (you can unsubscribe at any time);",
        "let you know when an event you asked about opens for registration;",
        "keep the site secure and prevent fraud; and",
        "meet our legal, tax and accounting obligations.",
      ],
    },
    {
      heading: "Your record with us",
      body: [
        "We keep one record for each email address that brings together your interactions with PynkPours: events you registered for or attended, waitlist and \"get notified\" requests, messages you sent us, and whether you've agreed to marketing emails. Our team may add short notes or labels to it (for example, that you spoke at one of our events). Only authorised PynkPours staff can see it.",
        "We use it to recognise returning guests, to answer you with the right context, and to invite past guests to future events.",
        "We send marketing emails, such as newsletters and event announcements, only to people who have agreed to receive them, by subscribing to our newsletter or ticking the box at checkout. Every marketing email includes an unsubscribe link. Emails about tickets you bought and replies to your messages are not marketing and are sent regardless.",
      ],
    },
    {
      heading: "Who we share it with",
      body: [
        "We share personal information only with service providers that help us run PynkPours, and only as needed for them to provide their service: Stripe (payments), Vercel (website hosting), Supabase (secure database), and our email delivery provider (ticket and confirmation emails). We may also disclose information if required by law or to protect the safety of our guests and staff.",
        "If you buy tickets for other guests, their names and email addresses are used to issue their individual tickets. Please make sure they're comfortable with that.",
      ],
    },
    {
      heading: "How long we keep it",
      list: [
        "Ticket orders and payment records: up to 7 years, for tax and accounting purposes.",
        "Contact and partnership messages: up to 2 years.",
        "Newsletter subscriptions: until you unsubscribe.",
        "Your record with us (see above): for as long as you keep interacting with PynkPours. You can ask us to delete it at any time.",
        "Event interest and waitlist requests: until the event has taken place or registration has closed.",
      ],
      body: [],
    },
    {
      heading: "Your choices and rights",
      body: [
        `You can ask us to show you, correct or delete the personal information we hold about you by emailing ${EMAIL}. We'll respond within 30 days. Some records, such as completed orders, may need to be kept for legal or accounting reasons, but we will tell you if that applies.`,
        "You can unsubscribe from our newsletter at any time using the link in any email or by contacting us.",
      ],
    },
    {
      heading: "Security",
      body: [
        "We protect your information with encryption in transit, access controls, two-step verification for staff, and per-ticket secure codes. No system is completely secure, but we work hard to keep your information safe and will notify you if a breach affects you as required by law.",
      ],
    },
    {
      heading: "Age requirement",
      body: [
        "Our events and website are intended for adults 18 and older. We do not knowingly collect personal information from anyone under 18. If you believe a minor has given us information, please contact us and we will delete it.",
      ],
    },
    {
      heading: "Changes to this policy",
      body: [
        "We may update this policy from time to time. The \"Last updated\" date at the top will change, and significant changes will be highlighted on our website.",
      ],
    },
    {
      heading: "Contact us",
      body: [`Questions about privacy? Email ${EMAIL}. PynkPours, Lake Charles, Louisiana.`],
    },
  ],
};

const refundPolicy: DraftPolicy = {
  title: "Refund Policy",
  updated: UPDATED,
  intro: [
    "We want every guest to have a great experience. Here's how refunds work for PynkPours events. If an event's page lists a different refund policy, that event's policy applies.",
  ],
  sections: [
    {
      heading: "Requests made 7 or more days before the event",
      body: [
        `Email ${EMAIL} with your order number at least 7 days before the event starts and we'll refund your ticket in full to your original payment method.`,
      ],
    },
    {
      heading: "Less than 7 days before the event",
      body: [
        "Tickets are non-refundable within 7 days of the event. You're welcome to send your ticket to someone else instead: email us at least 24 hours before the event with the new guest's name and email address, and we'll reissue the ticket in their name.",
      ],
    },
    {
      heading: "If we cancel an event",
      body: [
        "If PynkPours cancels an event, every ticket is refunded in full to the original payment method. You don't need to do anything.",
      ],
    },
    {
      heading: "If we reschedule or make a major change",
      body: [
        "If an event moves to a new date, or its venue changes to a different city, your ticket stays valid for the new arrangements. If you can't attend, email us within 7 days of our announcement for a full refund.",
      ],
    },
    {
      heading: "When refunds aren't available",
      list: [
        "No-shows or late arrival.",
        "Guests who can't show valid photo ID meeting the event's age requirement.",
        "Guests removed for violating our code of conduct.",
        "Tickets bought from anyone other than PynkPours.",
      ],
      body: [],
    },
    {
      heading: "How refunds are paid",
      body: [
        "Refunds go back to the card or payment method used to buy the ticket. Once processed, they usually appear within 5–10 business days, depending on your bank. A refunded ticket is cancelled immediately and can no longer be used for entry. Free registrations have nothing to refund, but please email us if you can't make it so we can offer your spot to someone else.",
      ],
    },
    {
      heading: "Questions",
      body: [`Email ${EMAIL} and include your order number. We're happy to help.`],
    },
  ],
};

const termsOfUse: DraftPolicy = {
  title: "Terms of Use",
  updated: UPDATED,
  intro: [
    "These terms apply when you use pynkpours.com, buy or register for tickets, or attend a PynkPours event. By doing any of these, you agree to them. Please read them along with our Privacy Policy and Refund Policy.",
  ],
  sections: [
    {
      heading: "Age and ID",
      body: [
        "All PynkPours events are for guests 18 and older. Every guest must bring a valid government-issued photo ID, which may be checked at the door. Some events have a higher age requirement, shown on the event page.",
        "Alcohol is served only to guests 21 and older with valid ID, in line with Louisiana law. Our staff and venue partners may refuse service to anyone who appears intoxicated or cannot show valid ID.",
      ],
    },
    {
      heading: "Tickets",
      list: [
        "Each ticket admits one guest and has its own secure code. A table purchase issues one ticket per seat.",
        "Keep your ticket private. The first person to present a valid code is admitted; duplicates are refused.",
        "Tickets may not be resold for more than their original price. We may cancel tickets we reasonably believe were obtained through fraud or unauthorized resale.",
        "Prices are shown in U.S. dollars. Ticket holds expire if checkout isn't completed in time.",
      ],
      body: [],
    },
    {
      heading: "Changes to events",
      body: [
        "Event details such as speakers, timings and menus may change. If we cancel or make a major change to an event, our Refund Policy explains your options. We are not responsible for travel, lodging or other costs you incur.",
      ],
    },
    {
      heading: "Code of conduct",
      body: [
        "PynkPours is a space for respectful connection. Harassment, discrimination, threats, and disruptive or unsafe behavior aren't tolerated. We may refuse entry to, or remove, anyone who breaks these rules or the venue's rules, without a refund.",
      ],
    },
    {
      heading: "Photography and video",
      body: [
        "Our events may be photographed and filmed. By attending, you agree that PynkPours may use images and recordings of the event, which may include you, for promotional purposes. If you'd prefer not to be photographed, please tell a member of our team at check-in and we'll do our best to accommodate you.",
      ],
    },
    {
      heading: "Responsible enjoyment",
      body: [
        "Please drink responsibly and plan a safe way home. You attend at your own risk and are responsible for your own belongings and conduct. To the fullest extent permitted by law, PynkPours is not liable for indirect or consequential losses, and our total liability relating to any event is limited to the amount you paid for your tickets.",
      ],
    },
    {
      heading: "Using our website",
      body: [
        "Don't misuse the site: no attempting to break in, overload or disrupt it, scrape personal information, or use it for anything unlawful. The PynkPours name, logos (including PynkPours® and Where Ideas Meet Opportunity®), designs and content belong to PynkPours and may not be used without permission.",
      ],
    },
    {
      heading: "Governing law",
      body: [
        "These terms are governed by the laws of the State of Louisiana. Any dispute will be handled in the courts located in Calcasieu Parish, Louisiana, unless the law requires otherwise.",
      ],
    },
    {
      heading: "Changes to these terms",
      body: [
        "We may update these terms from time to time. The version on this page when you buy a ticket applies to that purchase.",
      ],
    },
    {
      heading: "Contact us",
      body: [`Questions? Email ${EMAIL}. PynkPours, Lake Charles, Louisiana.`],
    },
  ],
};

export type PolicySlug = "privacy" | "terms" | "refunds";
export const POLICY_SLUGS: readonly PolicySlug[] = ["privacy", "terms", "refunds"];

export interface DefaultPolicy { title: string; text: string; updated: string }

function toDefault(d: DraftPolicy): DefaultPolicy {
  const blocks = (body: string[], list?: string[]): PolicyBlock[] => [
    ...body.map((text) => ({ kind: "p" as const, text })),
    ...(list?.length ? [{ kind: "ul" as const, items: list }] : []),
  ];
  return {
    title: d.title,
    updated: d.updated,
    text: policyToText({
      intro: d.intro.map((text) => ({ kind: "p" as const, text })),
      sections: d.sections.map((s) => ({ heading: s.heading, blocks: blocks(s.body, s.list) })),
    }),
  };
}

/** Built-in text shown until an owner/admin saves a version in the dashboard. */
export const DEFAULT_POLICIES: Record<PolicySlug, DefaultPolicy> = {
  privacy: toDefault(privacyPolicy),
  terms: toDefault(termsOfUse),
  refunds: toDefault(refundPolicy),
};
