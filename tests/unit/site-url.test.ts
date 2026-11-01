import { afterEach, describe, expect, it, vi } from "vitest";
import { publicSiteUrl } from "@/lib/site-url";

describe("publicSiteUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("builds absolute public links (admin pages may live on another host)", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://pynkpours-preview.vercel.app/");
    expect(publicSiteUrl()).toBe("https://pynkpours-preview.vercel.app/");
    expect(publicSiteUrl("/events/brunch")).toBe("https://pynkpours-preview.vercel.app/events/brunch");
    expect(publicSiteUrl("events")).toBe("https://pynkpours-preview.vercel.app/events");
  });

  it("falls back to a relative link when the site URL is not configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(publicSiteUrl("/events")).toBe("/events");
  });
});
