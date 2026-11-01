import { SITE_MIN_AGE } from "@/content/site";

/**
 * Minimum guest age for an event: the site-wide floor (18+) or the event's own,
 * stricter setting (e.g. 21+). Never lower than the site floor.
 */
export function effectiveMinAge(eventMinAge: number | null | undefined): number {
  return Math.max(SITE_MIN_AGE, eventMinAge ?? 0);
}
