/**
 * Contract check: the exact requests PynkPours sends are accepted by Stripe's
 * official mock server (stripe/stripe-mock), which validates every parameter
 * against Stripe's published OpenAPI specification.
 * Requires: docker run -p 12112:12111 stripe/stripe-mock
 */
import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { checkoutSessionParams, refundParams } from "@/lib/stripe-params";

const stripe = new Stripe("sk_test_123", { host: "127.0.0.1", port: 12112, protocol: "http" });
const reachable = await fetch("http://127.0.0.1:12112/v1/charges", { headers: { Authorization: "Bearer sk_test_123" } }).then(() => true, () => false);

describe.skipIf(!reachable)("Stripe API contract (stripe-mock)", () => {
  it("Checkout Session create params are valid", async () => {
    const params = checkoutSessionParams({
      orderId: "0b8f2f56-6f1f-4a1a-9f50-7f5d7f0c2a11", eventId: "4a7e9c1e-1f6b-4e8f-8d0e-2b9b5f4e1c33",
      eventTitle: "The Entrepreneurial Brunch", currency: "usd", purchaserEmail: "guest@example.com",
      lines: [{ name: "General Admission", unit_price_cents: 5900, quantity: 2 }, { name: "Table for 4", unit_price_cents: 20000, quantity: 1 }],
      orderUrl: "https://pynkpours.com/orders/abc", sessionMinutes: 31, nowSeconds: Math.floor(Date.now() / 1000),
    });
    const s = await stripe.checkout.sessions.create(params, { idempotencyKey: "checkout-session:test" });
    expect(s.object).toBe("checkout.session");
  });

  it("session retrieve and expire are valid", async () => {
    expect((await stripe.checkout.sessions.retrieve("cs_test_123")).object).toBe("checkout.session");
    expect((await stripe.checkout.sessions.expire("cs_test_123")).object).toBe("checkout.session");
  });

  it("refund create and list params are valid", async () => {
    const r = await stripe.refunds.create(refundParams({
      paymentIntent: "pi_123", amount: 2500, orderId: "0b8f2f56-6f1f-4a1a-9f50-7f5d7f0c2a11",
      ticketIds: ["a1b2c3d4-0000-4000-8000-000000000001"], actor: "a1b2c3d4-0000-4000-8000-000000000002", release: true, reason: "Guest can't attend",
    }), { idempotencyKey: "refund:test" });
    expect(r.object).toBe("refund");
    expect((await stripe.refunds.list({ payment_intent: "pi_123", limit: 100 })).object).toBe("list");
  });

  it("an invalid parameter IS rejected (proves validation is active)", async () => {
    await expect(stripe.checkout.sessions.create({ mode: "payment", not_a_real_param: true } as unknown as Stripe.Checkout.SessionCreateParams)).rejects.toThrow();
  });
});
