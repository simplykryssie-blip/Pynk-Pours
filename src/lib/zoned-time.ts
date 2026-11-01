/**
 * Convert between an event's wall-clock time (as entered in a
 * <input type="datetime-local">, e.g. "2026-12-05T11:00") and UTC instants,
 * using the event's IANA timezone — independent of the server's timezone.
 */
const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function offsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** "2026-12-05T11:00" in America/Chicago -> "2026-12-05T17:00:00.000Z". Throws for invalid or non-existent (DST gap) times. */
export function zonedLocalToUtc(local: string, timeZone: string): string {
  const m = LOCAL_RE.exec(local);
  if (!m) throw new Error("Invalid date/time");
  const [, y, mo, d, h, mi] = m.map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let t = guess - offsetMs(guess, timeZone);
  const second = guess - offsetMs(t, timeZone);
  if (second !== t) t = second;
  if (utcToZonedLocal(new Date(t).toISOString(), timeZone) !== local) {
    throw new Error("That time doesn't exist in this timezone (daylight-saving change)");
  }
  return new Date(t).toISOString();
}

/** UTC instant -> "YYYY-MM-DDTHH:mm" wall-clock in the timezone (for form defaults). */
export function utcToZonedLocal(iso: string, timeZone: string): string {
  const t = new Date(iso).getTime();
  const local = new Date(t + offsetMs(t, timeZone));
  return local.toISOString().slice(0, 16);
}

export const EVENT_TIMEZONES = [
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Chicago", label: "Central (Chicago / Louisiana)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Phoenix", label: "Arizona (Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
  { value: "UTC", label: "UTC" },
] as const;
