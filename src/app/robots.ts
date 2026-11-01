import type { MetadataRoute } from "next";

/** Search engines are blocked until the owner approves launch (SITE_INDEXABLE=true). */
export default function robots(): MetadataRoute.Robots {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  if (process.env.SITE_INDEXABLE !== "true") return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/t/", "/orders/", "/api/"] },
    sitemap: `${site}/sitemap.xml`,
  };
}
