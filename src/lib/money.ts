/** Format integer minor units (cents) for display. Never use floats for money. */
export function formatMoney(cents: number, currency = "usd", locale = "en-US"): string {
  if (!Number.isInteger(cents)) throw new Error("Money amounts must be integer cents");
  return new Intl.NumberFormat(locale, { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}
