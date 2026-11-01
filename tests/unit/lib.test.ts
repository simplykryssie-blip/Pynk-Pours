import { describe, expect, it } from "vitest";
import { formatMoney } from "@/lib/money";
import { formatEventDate, formatEventTime, formatEventTimeRange } from "@/lib/datetime";
import { toCsv } from "@/lib/csv";

describe("money", () => {
  it("formats integer cents", () => {
    expect(formatMoney(5900)).toBe("$59.00");
    expect(formatMoney(0)).toBe("$0.00");
    expect(() => formatMoney(59.5)).toThrow();
  });
});

describe("event datetimes are shown in the event's timezone", () => {
  // Arbitrary test instant: 16:00Z is 11:00 AM in Chicago (CDT; DST began Mar 8 2026)
  const start = "2026-03-21T16:00:00Z";
  const end = "2026-03-21T20:00:00Z";
  it("regardless of server timezone", () => {
    expect(formatEventDate(start, "America/Chicago")).toBe("Sat, Mar 21, 2026");
    expect(formatEventTime(start, "America/Chicago")).toBe("11:00 AM CDT");
    expect(formatEventTime(start, "America/New_York")).toBe("12:00 PM EDT");
    expect(formatEventTimeRange(start, end, "America/Chicago")).toBe("11:00 AM – 3:00 PM CDT");
  });
  it("handles a date that differs by zone", () => {
    expect(formatEventDate("2026-12-01T03:00:00Z", "America/Los_Angeles")).toBe("Mon, Nov 30, 2026");
  });
});

describe("csv export", () => {
  it("escapes quotes, commas and newlines", () => {
    expect(toCsv(["a", "b"], [['say "hi"', "x,y\nz"]])).toBe('a,b\r\n"say ""hi""","x,y\nz"\r\n');
  });
  it("neutralises spreadsheet formula injection", () => {
    const out = toCsv(["name"], [["=HYPERLINK(\"http://evil\")"], ["+1"], ["-2"], ["@SUM(A1)"], ["Normal"]]);
    expect(out.split("\r\n").slice(1, 6)).toEqual(['"\'=HYPERLINK(""http://evil"")"', "'+1", "'-2", "'@SUM(A1)", "Normal"]);
  });
  it("leaves numbers alone and handles null", () => {
    expect(toCsv(["n", "x"], [[-5, null]])).toBe("n,x\r\n-5,\r\n");
  });
});
