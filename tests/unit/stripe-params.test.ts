import { describe, expect, it } from "vitest";
import { checkoutSessionParams } from "@/lib/stripe-params";

/** Owner decision pending: fees and sales tax must stay OFF until approved. */
describe("checkout session params — no fees, no tax", () => {
  const p = checkoutSessionParams({
    orderId: "o", eventId: "e", eventTitle: "Event", currency: "usd", purchaserEmail: "a@b.co",
    lines: [{ name: "GA", unit_price_cents: 4500, quantity: 2 }, { name: "Table", unit_price_cents: 16000, quantity: 1 }],
    orderUrl: "https://x/orders/t", sessionMinutes: 31, nowSeconds: 1_800_000_000,
  });
  it("charges exactly the ticket prices: no fee line items, tax, discounts or promo codes", () => {
    expect(p.line_items).toHaveLength(2);
    expect(p.line_items!.reduce((a, li) => a + (li.price_data!.unit_amount as number) * li.quantity!, 0)).toBe(25000);
    for (const key of ["automatic_tax", "tax_id_collection", "discounts", "allow_promotion_codes", "shipping_options"]) {
      expect(p).not.toHaveProperty(key);
    }
    expect(p.line_items!.every((li) => !("tax_rates" in li))).toBe(true);
    expect(p.payment_intent_data).not.toHaveProperty("application_fee_amount");
  });
  it("is card-only, single-currency, and expires before the inventory hold", () => {
    expect(p.allowed_payment_method_types).toEqual(["card"]);
    expect(p.line_items!.every((li) => li.price_data!.currency === "usd")).toBe(true);
    expect(p.expires_at).toBe(1_800_000_000 + 31 * 60); // hold is 35 minutes
  });
});
