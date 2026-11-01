/**
 * Event times are stored as UTC instants plus the event's IANA timezone, and
 * always displayed in the EVENT's timezone (not the viewer's), with the zone
 * abbreviation shown so there is no ambiguity.
 */
export function formatEventDate(iso: string | Date, timeZone: string, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone, weekday: "short", month: "short", day: "numeric", year: "numeric",
  }).format(new Date(iso));
}

export function formatEventTime(iso: string | Date, timeZone: string, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone, hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(iso));
}

export function formatEventTimeRange(
  startIso: string | Date, endIso: string | Date | null, timeZone: string, locale = "en-US",
): string {
  if (!endIso) return formatEventTime(startIso, timeZone, locale);
  const fmt = new Intl.DateTimeFormat(locale, { timeZone, hour: "numeric", minute: "2-digit" });
  const end = formatEventTime(endIso, timeZone, locale);
  return `${fmt.format(new Date(startIso))} – ${end}`;
}
