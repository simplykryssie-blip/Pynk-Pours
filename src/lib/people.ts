/** Shared People-list definitions (dashboard). */
export const PEOPLE_SEGMENTS = [
  { value: "all", label: "Everyone" },
  { value: "attended", label: "Attended an event" },
  { value: "missed", label: "Registered, didn't attend" },
  { value: "registered", label: "Registered or bought" },
  { value: "inquired", label: "Sent a message" },
  { value: "interested", label: "Waitlist / get notified" },
  { value: "subscribed", label: "Can receive marketing" },
  { value: "not_subscribed", label: "No marketing permission" },
] as const;

export type PeopleSegment = (typeof PEOPLE_SEGMENTS)[number]["value"];

export function parseSegment(v: unknown): PeopleSegment {
  return PEOPLE_SEGMENTS.some((s) => s.value === v) ? (v as PeopleSegment) : "all";
}

/** URL-safe key for one person's page (emails can contain characters that don't belong in a path). */
export const personKey = (email: string) => Buffer.from(email, "utf8").toString("base64url");
export const emailFromKey = (key: string) => {
  try {
    const e = Buffer.from(key, "base64url").toString("utf8");
    return /^[^\s@]+@[^\s@]+$/.test(e) && e.length <= 320 ? e : null;
  } catch {
    return null;
  }
};

/** Tags: lowercase words, dashes allowed; up to 20. */
export function parseTags(input: string): string[] {
  return [...new Set(input.split(/[,\n]/).map((t) => t.trim().toLowerCase().replace(/\s+/g, "-")).filter((t) => /^[a-z0-9][a-z0-9-]{0,29}$/.test(t)))].slice(0, 20);
}

export const MARKETING_LABEL: Record<string, string> = {
  yes: "Can receive marketing",
  no: "No marketing permission",
  unsubscribed: "Unsubscribed",
};
