import { describe, expect, it } from "vitest";
import { buildIcs } from "@/lib/ics";

describe("buildIcs", () => {
  const ics = buildIcs({
    uid: "abc@pynkpours.com", title: "Brunch; with, commas", startsAt: "2026-12-05T17:00:00Z",
    endsAt: null, location: "Sample Venue, 1 Main St", description: "Line one\nLine two",
    url: "https://pynkpours.com/events/x",
  }, new Date("2026-11-01T00:00:00Z"));
  it("produces a valid VEVENT with UTC times and CRLF line endings", () => {
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("DTSTART:20261205T170000Z");
    expect(ics).toContain("DTEND:20261205T190000Z"); // default 2h when no end
    expect(ics).toContain("DTSTAMP:20261101T000000Z");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
  it("escapes special characters", () => {
    expect(ics).toContain("SUMMARY:Brunch\\; with\\, commas");
    expect(ics).toContain("DESCRIPTION:Line one\\nLine two");
  });
  it("folds long lines at 75 octets", () => {
    const long = buildIcs({ uid: "u", title: "x".repeat(200), startsAt: "2026-12-05T17:00:00Z", endsAt: null, location: null, description: null, url: "u" });
    for (const line of long.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  });
});
