import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { adminHostRedirect } from "@/lib/admin-host";

/**
 * 1. Optional dedicated staff hostname (ADMIN_HOST): see src/lib/admin-host.ts.
 * 2. For /admin routes: refreshes the staff session cookie and sends visitors
 *    without any session straight to the sign-in page. Full authorization
 *    (MFA level + staff role) is enforced again by every page and action.
 */
// Reachable without a session (the reset pages handle a missing/expired session themselves).
const PUBLIC_ADMIN_PATHS = ["/admin/login", "/admin/forgot-password", "/admin/reset-password", "/admin/auth/recovery"];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const moveTo = adminHostRedirect({
    host: request.headers.get("host"),
    pathname: path,
    search: request.nextUrl.search,
    adminHost: process.env.ADMIN_HOST,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  });
  if (moveTo) return NextResponse.redirect(moveTo, 307);
  if (path !== "/admin" && !path.startsWith("/admin/")) return NextResponse.next();

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) {
          response.cookies.set(name, value, { ...options, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
        }
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user && !PUBLIC_ADMIN_PATHS.some((p) => path.startsWith(p))) {
    const login = request.nextUrl.clone();
    login.pathname = "/admin/login";
    login.search = "";
    return NextResponse.redirect(login);
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  // Every page (for the admin-host redirect), but not static assets or API routes.
  matcher: ["/((?!api/|_next/static|_next/image|brand/|icon.png|apple-icon.png|favicon.ico|robots.txt|sitemap.xml).*)"],
};
