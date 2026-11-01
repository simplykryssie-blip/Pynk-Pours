/**
 * Split order-item prices across individual tickets so a refund for specific
 * tickets is exact to the cent. A table ($160, admits 4) is $40 per guest;
 * any remainder cents go to the first seats so a full unit always sums exactly.
 */
export interface ItemForRefund { id: string; unit_price_cents: number; admits_per_unit: number }
export interface TicketForRefund { id: string; order_item_id: string; position: number; status: string }

export function ticketShares(items: ItemForRefund[], tickets: TicketForRefund[]): Map<string, number> {
  const shares = new Map<string, number>();
  for (const item of items) {
    const seats = tickets.filter((t) => t.order_item_id === item.id).sort((a, b) => a.position - b.position);
    const base = Math.floor(item.unit_price_cents / item.admits_per_unit);
    const extra = item.unit_price_cents % item.admits_per_unit;
    seats.forEach((t, k) => shares.set(t.id, base + ((k % item.admits_per_unit) < extra ? 1 : 0)));
  }
  return shares;
}

/** Amount to refund for the chosen tickets, capped at what remains refundable. */
export function refundAmount(
  items: ItemForRefund[], tickets: TicketForRefund[], selected: string[], remainingCents: number,
): { amount: number; ticketIds: string[] } {
  const shares = ticketShares(items, tickets);
  const valid = tickets.filter((t) => selected.includes(t.id) && t.status === "valid").map((t) => t.id);
  const sum = valid.reduce((a, id) => a + (shares.get(id) ?? 0), 0);
  return { amount: Math.min(sum, Math.max(0, remainingCents)), ticketIds: valid };
}
