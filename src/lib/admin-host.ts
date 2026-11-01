/**
 * Dedicated staff hostname (e.g. admin.pynkpours.com), enabled by ADMIN_HOST.
 *
 *  - On the admin host, "/" opens the staff area, and public pages send visitors
 *    back to the public site (NEXT_PUBLIC_SITE_URL).
 *  - On any other host, /admin/* moves to the admin host.
 *
 * Returns the absolute URL to redirect to, or null to continue as normal.
 * When ADMIN_HOST is unset, nothing changes (local development, tests, CI).
 * This separates staff traffic. Access control is still password + authenticator,
 * enforced by the pages, actions and database.
 */
export function adminHostRedirect(opts: {
  host: string | null;
  pathname: string;
  search: string;
  adminHost: string | undefined;
  siteUrl: string | undefined;
}): string | null {
  const adminHost = normaliseHost(opts.adminHost);
  if (!adminHost) return null;
  const host = normaliseHost(opts.host);
  if (!host) return null;

  const isAdminPath = opts.pathname === "/admin" || opts.pathname.startsWith("/admin/");

  if (host === adminHost) {
    if (isAdminPath) return null;
    if (opts.pathname === "/") return `https://${adminHost}/admin`;
    const site = safeOrigin(opts.siteUrl);
    if (!site || normaliseHost(new URL(site).host) === adminHost) return `https://${adminHost}/admin`;
    return `${site}${opts.pathname}${opts.search}`;
  }

  if (isAdminPath) return `https://${adminHost}${opts.pathname}${opts.search}`;
  return null;
}

function normaliseHost(value: string | null | undefined): string | null {
  if (!value) return null;
  const host = value.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  return /^[a-z0-9.-]+$/.test(host) ? host : null;
}

function safeOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
  } catch {
    return null;
  }
}
