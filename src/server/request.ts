import "server-only";
import { headers } from "next/headers";
import { rateLimitKey } from "./credentials";
import { envSubset } from "./env";
import { serviceDb } from "./supabase";

/** Best-effort client IP (Vercel sets x-forwarded-for / x-real-ip). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || h.get("x-real-ip") || "unknown";
}

/**
 * Returns true if the request is within the limit. Uses the atomic
 * check_rate_limit() RPC; the IP is HMAC-hashed with RATE_LIMIT_SALT.
 * Fails CLOSED (treats errors as limited) so abuse can't bypass it.
 */
export async function withinRateLimit(bucket: string, limit: number, windowSeconds: number, extraKey = "") {
  const { RATE_LIMIT_SALT } = envSubset(["RATE_LIMIT_SALT"]);
  const key = rateLimitKey(`${await clientIp()}|${extraKey}`, RATE_LIMIT_SALT);
  const { data, error } = await serviceDb().rpc("check_rate_limit", {
    p_bucket: bucket, p_key_hash: key, p_limit: limit, p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error(`[rate-limit] ${bucket}: ${error.message}`);
    return false;
  }
  return data === true;
}
