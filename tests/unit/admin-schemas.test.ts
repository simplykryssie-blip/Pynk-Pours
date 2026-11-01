import { describe, expect, it } from "vitest";
import { eventFormSchema, parsePriceToCents, slugify, ticketFormSchema, ticketPayload } from "@/lib/admin-schemas";

const baseEvent = {
  title: "The Entrepreneurial Brunch", slug: "", category_label: "", short_description: "A gathering",
  description: "", timezone: "America/Chicago", starts_local: "2026-12-05T11:00", ends_local: "2026-12-05T15:00",
  registration_closes_local: "", is_online: "", venue_name: "Venue", venue_address: "", venue_notes: "",
  dress_code: "", parking_info: "", accessibility_info: "", refund_policy: "", min_age: "", capacity: "",
  max_tickets_per_order: "", show_remaining_count: "", registration_mode: "tickets", sold_out_behavior: "sold_out",
  is_featured: "on", agenda: "[]", faqs: "[]", speakers: "[]",
};

describe("slugify & prices", () => {
  it("slugifies titles", () => {
    expect(slugify("The Entrepreneurial Brunch!")).toBe("the-entrepreneurial-brunch");
    expect(slugify("Café & Créativité 2026")).toBe("cafe-and-creativite-2026");
    expect(slugify("---")).toBe("");
  });
  it("parses prices to integer cents", () => {
    expect(parsePriceToCents("25")).toBe(2500);
    expect(parsePriceToCents("$1,250.5")).toBe(125050);
    expect(parsePriceToCents("0")).toBe(0);
    expect(parsePriceToCents("19.999")).toBeNull();
    expect(parsePriceToCents("-5")).toBeNull();
    expect(parsePriceToCents("abc")).toBeNull();
  });
});

describe("event form", () => {
  it("converts event-timezone times to UTC and derives the slug", () => {
    const r = eventFormSchema.parse(baseEvent);
    expect(r).toMatchObject({
      slug: "the-entrepreneurial-brunch", starts_at: "2026-12-05T17:00:00.000Z", ends_at: "2026-12-05T21:00:00.000Z",
      is_featured: true, is_online: false, max_tickets_per_order: 10, capacity: null, category_label: null, currency: "usd",
    });
  });
  it("treats unticked (absent) checkboxes as false, like a real browser submission", () => {
    const { is_online: _a, show_remaining_count: _b, is_featured: _c, ...noBoxes } = baseEvent;
    void _a; void _b; void _c;
    const r = eventFormSchema.parse(noBoxes);
    expect(r).toMatchObject({ is_online: false, show_remaining_count: false, is_featured: false });
  });
  it("allows a date-TBA event", () => {
    const r = eventFormSchema.parse({ ...baseEvent, starts_local: "", ends_local: "", registration_mode: "coming_soon" });
    expect(r.starts_at).toBeNull();
  });
  it("rejects end before start, deadline after end, bad timezone, bad lists", () => {
    expect(eventFormSchema.safeParse({ ...baseEvent, ends_local: "2026-12-05T10:00" }).success).toBe(false);
    expect(eventFormSchema.safeParse({ ...baseEvent, registration_closes_local: "2026-12-06T10:00" }).success).toBe(false);
    expect(eventFormSchema.safeParse({ ...baseEvent, timezone: "Mars/Base" }).success).toBe(false);
    expect(eventFormSchema.safeParse({ ...baseEvent, faqs: '[{"question":"Q"}]' }).success).toBe(false);
    expect(eventFormSchema.safeParse({ ...baseEvent, faqs: "not json" }).success).toBe(false);
  });
  it("parses agenda/FAQ/speaker lists", () => {
    const r = eventFormSchema.parse({ ...baseEvent, agenda: '[{"time":"11:00 AM","title":"Welcome"}]', faqs: '[{"question":"Parking?","answer":"Yes"}]' });
    expect(r.agenda).toEqual([{ time: "11:00 AM", title: "Welcome" }]);
    expect(r.faqs).toHaveLength(1);
  });
});

describe("ticket form", () => {
  const base = { name: "General Admission", description: "", inclusions: "Brunch\n\n Networking ", price: "59", admits_per_unit: "", capacity: "100", max_per_order: "", sales_start_local: "", sales_end_local: "2026-12-01T23:59", status: "active" };
  it("builds a DB payload with cents and UTC sale window", () => {
    const p = ticketPayload(ticketFormSchema.parse(base), "America/Chicago");
    expect(p).toMatchObject({ name: "General Admission", price_cents: 5900, capacity: 100, admits_per_unit: 1, max_per_order: null,
      inclusions: ["Brunch", "Networking"], sales_start_at: null, sales_end_at: "2026-12-02T05:59:00.000Z", status: "active" });
  });
  it("supports free and unlimited tickets", () => {
    const p = ticketPayload(ticketFormSchema.parse({ ...base, price: "0", capacity: "", sales_end_local: "" }), null);
    expect(p).toMatchObject({ price_cents: 0, capacity: null });
  });
  it("rejects bad prices and windows", () => {
    expect(ticketFormSchema.safeParse({ ...base, price: "12.345" }).success).toBe(false);
    expect(() => ticketPayload(ticketFormSchema.parse({ ...base, sales_start_local: "2026-12-02T00:00" }), "America/Chicago")).toThrow(/end after/);
    expect(() => ticketPayload(ticketFormSchema.parse(base), null)).toThrow(/timezone/);
  });
});
