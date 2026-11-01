import { describe, expect, it } from "vitest";
import { utcToZonedLocal, zonedLocalToUtc } from "@/lib/zoned-time";

describe("zoned time conversion", () => {
  it("converts wall-clock event times to UTC in standard and daylight time", () => {
    expect(zonedLocalToUtc("2026-12-05T11:00", "America/Chicago")).toBe("2026-12-05T17:00:00.000Z"); // CST
    expect(zonedLocalToUtc("2026-07-04T11:00", "America/Chicago")).toBe("2026-07-04T16:00:00.000Z"); // CDT
    expect(zonedLocalToUtc("2026-07-04T11:00", "America/Phoenix")).toBe("2026-07-04T18:00:00.000Z"); // no DST
    expect(zonedLocalToUtc("2026-12-31T23:30", "Pacific/Honolulu")).toBe("2027-01-01T09:30:00.000Z");
  });
  it("round-trips back to the same wall-clock time", () => {
    for (const tz of ["America/New_York", "America/Chicago", "America/Los_Angeles", "UTC"]) {
      for (const local of ["2026-03-07T09:15", "2026-03-09T09:15", "2026-11-01T00:30", "2026-11-02T18:45"]) {
        expect(utcToZonedLocal(zonedLocalToUtc(local, tz), tz)).toBe(local);
      }
    }
  });
  it("rejects malformed input and non-existent DST-gap times", () => {
    expect(() => zonedLocalToUtc("2026-12-05 11:00", "America/Chicago")).toThrow();
    expect(() => zonedLocalToUtc("2026-03-08T02:30", "America/Chicago")).toThrow(/doesn't exist/);
  });
});
