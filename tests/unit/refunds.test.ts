import { describe, expect, it } from "vitest";
import { refundAmount, ticketShares } from "@/lib/refunds";

const items = [
  { id: "ga", unit_price_cents: 4500, admits_per_unit: 1 },
  { id: "table", unit_price_cents: 16001, admits_per_unit: 4 }, // odd cents on purpose
];
const tickets = [
  { id: "g1", order_item_id: "ga", position: 1, status: "valid" },
  { id: "g2", order_item_id: "ga", position: 2, status: "valid" },
  ...[3, 4, 5, 6].map((p, i) => ({ id: `t${i + 1}`, order_item_id: "table", position: p, status: "valid" })),
];

describe("refund allocation", () => {
  it("splits a table across its guests exactly", () => {
    const s = ticketShares(items, tickets);
    expect([s.get("t1"), s.get("t2"), s.get("t3"), s.get("t4")]).toEqual([4001, 4000, 4000, 4000]);
    expect(["t1", "t2", "t3", "t4"].reduce((a, id) => a + s.get(id)!, 0)).toBe(16001);
    expect(s.get("g1")).toBe(4500);
  });
  it("refunds only selected, still-valid tickets, capped at the remaining amount", () => {
    expect(refundAmount(items, tickets, ["g1", "t2"], 100000)).toEqual({ amount: 8500, ticketIds: ["g1", "t2"] });
    const withRefunded = tickets.map((t) => (t.id === "g1" ? { ...t, status: "refunded" } : t));
    expect(refundAmount(items, withRefunded, ["g1", "g2"], 100000)).toEqual({ amount: 4500, ticketIds: ["g2"] });
    expect(refundAmount(items, tickets, ["g1", "g2"], 6000).amount).toBe(6000);
  });
  it("whole order sums to the order total", () => {
    const all = tickets.map((t) => t.id);
    expect(refundAmount(items, tickets, all, 999999).amount).toBe(2 * 4500 + 16001);
  });
});
