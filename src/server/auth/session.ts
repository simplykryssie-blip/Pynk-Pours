import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { envSubset } from "../env";

/**
 * Staff session client (cookie-based). All auth calls happen on the server, so
 * session cookies are httpOnly — page scripts can never read the tokens.
 */
export const SESSION_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};

export async function sessionDb(): Promise<SupabaseClient> {
  // Staff sessions are strictly per-request: never part of any prerender/prefetch.
  await connection();
  const env = envSubset(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]);
  const store = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, { ...options, ...SESSION_COOKIE_OPTIONS });
        } catch {
          // Called from a Server Component render: cookies are refreshed by src/proxy.ts instead.
        }
      },
    },
  });
}
