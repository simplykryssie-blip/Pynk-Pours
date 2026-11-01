/**
 * Absolute URL on the PUBLIC site. Admin pages may be served from a separate
 * staff hostname (ADMIN_HOST), so links to public pages must not be relative.
 */
export function publicSiteUrl(path = "/"): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
