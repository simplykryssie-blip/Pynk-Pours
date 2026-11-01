import { describe, expect, it } from "vitest";
import { contactSchema, interestSchema, looksAutomated, newsletterSchema, MIN_FILL_MS } from "@/lib/validation";

describe("contact validation", () => {
  const ok = { name: " Ada ", email: " ADA@Example.COM ", topic: "general", subject: "", message: "Hello there, a question." };
  it("normalises and accepts valid input", () => {
    const r = contactSchema.parse(ok);
    expect(r).toMatchObject({ name: "Ada", email: "ada@example.com", subject: undefined });
  });
  it("rejects bad email, short message, unknown topic", () => {
    expect(contactSchema.safeParse({ ...ok, email: "nope" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...ok, message: "hi" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...ok, topic: "hack" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...ok, message: "x".repeat(5001) }).success).toBe(false);
  });
});

describe("newsletter + interest validation", () => {
  it("accepts a clean email and a safe source tag", () => {
    expect(newsletterSchema.parse({ email: "a@b.co", source: "footer" })).toEqual({ email: "a@b.co", source: "footer" });
    expect(newsletterSchema.safeParse({ email: "a@b.co", source: "<script>" }).success).toBe(false);
  });
  it("interest requires a valid slug and kind", () => {
    expect(interestSchema.safeParse({ eventSlug: "../etc", kind: "notify", email: "a@b.co" }).success).toBe(false);
    expect(interestSchema.safeParse({ eventSlug: "brunch", kind: "vip", email: "a@b.co" }).success).toBe(false);
    expect(interestSchema.parse({ eventSlug: "brunch", kind: "waitlist", email: "a@b.co", quantity: "2" }).quantity).toBe(2);
    // An empty optional field (as browsers submit it) must not fail validation.
    expect(interestSchema.parse({ eventSlug: "brunch", kind: "notify", email: "a@b.co", quantity: "" }).quantity).toBeUndefined();
  });
});

describe("spam heuristics", () => {
  const form = (fields: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.set(k, v);
    return f;
  };
  const now = 1_000_000;
  it("flags filled honeypots, missing or too-fast timestamps", () => {
    expect(looksAutomated(form({ company_website: "spam.example", started_at: String(now - 10_000) }), now)).toBe(true);
    expect(looksAutomated(form({}), now)).toBe(true);
    expect(looksAutomated(form({ started_at: String(now - 500) }), now)).toBe(true);
  });
  it("passes a human-paced submission", () => {
    expect(looksAutomated(form({ started_at: String(now - MIN_FILL_MS - 1) }), now)).toBe(false);
  });
});
