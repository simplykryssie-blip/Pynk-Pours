import { describe, expect, it } from "vitest";
import { adminHostRedirect } from "@/lib/admin-host";

const base = {
  adminHost: "admin.pynkpours.com",
  siteUrl: "https://pynkpours-preview.vercel.app",
  search: "",
};

describe("adminHostRedirect", () => {
  it("does nothing when ADMIN_HOST is not configured", () => {
    for (const adminHost of [undefined, "", "   "]) {
      expect(adminHostRedirect({ ...base, adminHost, host: "localhost:3123", pathname: "/admin" })).toBeNull();
      expect(adminHostRedirect({ ...base, adminHost, host: "localhost:3123", pathname: "/" })).toBeNull();
    }
  });

  it("serves the staff area on the admin host", () => {
    for (const pathname of ["/admin", "/admin/login", "/admin/events/123"]) {
      expect(adminHostRedirect({ ...base, host: "admin.pynkpours.com", pathname })).toBeNull();
    }
  });

  it("opens the dashboard at the admin host root", () => {
    expect(adminHostRedirect({ ...base, host: "admin.pynkpours.com", pathname: "/" })).toBe("https://admin.pynkpours.com/admin");
  });

  it("sends public pages on the admin host back to the public site, keeping path and query", () => {
    expect(adminHostRedirect({ ...base, host: "admin.pynkpours.com", pathname: "/events", search: "?view=past" }))
      .toBe("https://pynkpours-preview.vercel.app/events?view=past");
  });

  it("never redirects the admin host to itself when the site URL is the admin host", () => {
    expect(adminHostRedirect({ ...base, siteUrl: "https://admin.pynkpours.com", host: "admin.pynkpours.com", pathname: "/about" }))
      .toBe("https://admin.pynkpours.com/admin");
    expect(adminHostRedirect({ ...base, siteUrl: "not a url", host: "admin.pynkpours.com", pathname: "/about" }))
      .toBe("https://admin.pynkpours.com/admin");
  });

  it("moves /admin on other hosts to the admin host, keeping path and query", () => {
    expect(adminHostRedirect({ ...base, host: "pynkpours-preview.vercel.app", pathname: "/admin/orders", search: "?q=x" }))
      .toBe("https://admin.pynkpours.com/admin/orders?q=x");
    expect(adminHostRedirect({ ...base, host: "pynkpours-preview.vercel.app", pathname: "/admin" }))
      .toBe("https://admin.pynkpours.com/admin");
  });

  it("leaves public pages alone on other hosts", () => {
    for (const pathname of ["/", "/events", "/administrator", "/admins"]) {
      expect(adminHostRedirect({ ...base, host: "pynkpours-preview.vercel.app", pathname })).toBeNull();
    }
  });

  it("normalises case, ports and trailing dots, and ignores malformed hosts", () => {
    expect(adminHostRedirect({ ...base, adminHost: " Admin.PynkPours.com ", host: "ADMIN.pynkpours.com:443", pathname: "/admin" })).toBeNull();
    expect(adminHostRedirect({ ...base, host: "admin.pynkpours.com.", pathname: "/admin" })).toBeNull();
    expect(adminHostRedirect({ ...base, host: null, pathname: "/admin" })).toBeNull();
    expect(adminHostRedirect({ ...base, host: "evil.com/x", pathname: "/admin" })).toBeNull();
  });
});
