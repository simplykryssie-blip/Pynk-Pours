import { describe, expect, it } from "vitest";
import { deriveRegistration, type RegistrationInput } from "@/lib/registration";

const now = new Date("2026-11-01T12:00:00Z");
const future = "2026-12-01T18:00:00Z";
const base: RegistrationInput = {
  status: "published", registration_mode: "tickets", sold_out_behavior: "sold_out",
  starts_at: future, ends_at: "2026-12-01T22:00:00Z",
};
const opt = (display_state: string, price_cents = 5000, sales_start_at: string | null = null) =>
  ({ display_state, price_cents, sales_start_at });

describe("deriveRegistration", () => {
  it("on sale shows the lowest purchasable price", () => {
    const r = deriveRegistration(base, [opt("on_sale", 9900), opt("on_sale", 5900), opt("sold_out", 100)], now);
    expect(r).toMatchObject({ state: "on_sale", fromPriceCents: 5900 });
  });
  it("coming soon and closed modes win over options", () => {
    expect(deriveRegistration({ ...base, registration_mode: "coming_soon" }, [opt("on_sale")], now).state).toBe("coming_soon");
    expect(deriveRegistration({ ...base, registration_mode: "closed" }, [opt("on_sale")], now).state).toBe("closed");
  });
  it("coming soon works with no date (TBA)", () => {
    expect(deriveRegistration({ ...base, registration_mode: "coming_soon", starts_at: null, ends_at: null }, [], now).state)
      .toBe("coming_soon");
  });
  it("sold out vs waitlist follows the event's setting", () => {
    expect(deriveRegistration(base, [opt("sold_out")], now).state).toBe("sold_out");
    expect(deriveRegistration({ ...base, sold_out_behavior: "waitlist" }, [opt("sold_out")], now).state).toBe("waitlist");
  });
  it("scheduled sales report the earliest opening", () => {
    const r = deriveRegistration(base, [opt("scheduled", 1, "2026-11-20T00:00:00Z"), opt("scheduled", 1, "2026-11-10T00:00:00Z")], now);
    expect(r).toMatchObject({ state: "not_yet_on_sale", salesOpenAt: "2026-11-10T00:00:00Z" });
  });
  it("cancelled and past events are never purchasable", () => {
    expect(deriveRegistration({ ...base, status: "cancelled" }, [opt("on_sale")], now).state).toBe("cancelled");
    expect(deriveRegistration({ ...base, starts_at: "2026-10-01T18:00:00Z", ends_at: "2026-10-01T20:00:00Z" }, [opt("on_sale")], now).state).toBe("past");
    expect(deriveRegistration({ ...base, status: "completed" }, [opt("on_sale")], now).state).toBe("past");
  });
  it("paused/closed/ended tiers only => closed", () => {
    expect(deriveRegistration(base, [opt("paused"), opt("ended")], now).state).toBe("closed");
    expect(deriveRegistration(base, [], now).state).toBe("closed");
  });
});
