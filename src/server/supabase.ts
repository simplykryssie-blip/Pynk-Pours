import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { envSubset } from "./env";

/**
 * Public (anon) client: uses the publishable key, so every query is subject to
 * RLS exactly as an anonymous visitor. Use for all public page reads.
 */
export function publicDb(): SupabaseClient {
  const env = envSubset(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]);
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Trusted server client (secret key). Bypasses RLS — only for validated,
 * rate-limited server actions and trusted RPCs. Never pass results unfiltered
 * to the client.
 */
export function serviceDb(): SupabaseClient {
  const env = envSubset(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"]);
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
