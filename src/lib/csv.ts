/**
 * CSV export with spreadsheet formula-injection protection: cells starting with
 * = + - @ tab or CR are prefixed with a single quote so Excel/Sheets treat them
 * as text (attendee names and answers are user-supplied).
 */
export type CsvValue = string | number | boolean | Date | null | undefined | object;

function cell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (value instanceof Date) s = value.toISOString();
  else if (typeof value === "object") s = JSON.stringify(value);
  else s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: CsvValue[][]): string {
  return [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}
