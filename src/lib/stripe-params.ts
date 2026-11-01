import type Stripe from "stripe";

/** The exact Checkout Session request PynkPours sends (pure; contract-tested against stripe-mock). */
export function checkoutSessionParams(input: {
  orderId: string; eventId: string; eventTitle: string; currency: string; purchaserEmail: string;
  lines: { name: string; unit_price_cents: number; quantity: number }[];
  orderUrl: string; sessionMinutes: number; nowSeconds: number;
}): Stripe.Checkout.SessionCreateParams {
  return {
    mode: "payment",
    submit_type: "pay",
    allowed_payment_method_types: ["card"], // cards & wallets: immediate confirmation, no delayed methods
    customer_email: input.purchaserEmail,
    client_reference_id: input.orderId,
    metadata: { order_id: input.orderId, event_id: input.eventId },
    payment_intent_data: { metadata: { order_id: input.orderId, event_id: input.eventId }, description: `PynkPours — ${input.eventTitle}`.slice(0, 1000) },
    line_items: input.lines.map((li) => ({
      quantity: li.quantity,
      price_data: { currency: input.currency, unit_amount: li.unit_price_cents, product_data: { name: `${input.eventTitle} — ${li.name}`.slice(0, 250) } },
    })),
    expires_at: input.nowSeconds + input.sessionMinutes * 60,
    success_url: `${input.orderUrl}?from=checkout`,
    cancel_url: `${input.orderUrl}?cancelled=1`,
  };
}

export function refundParams(input: { paymentIntent: string; amount: number; orderId: string; ticketIds: string[]; actor: string; release: boolean; reason: string }): Stripe.RefundCreateParams {
  const ids = input.ticketIds.join(",");
  return {
    payment_intent: input.paymentIntent,
    amount: input.amount,
    reason: "requested_by_customer",
    metadata: { order_id: input.orderId, ticket_ids: ids.length <= 500 ? ids : "", initiated_by: input.actor, release_inventory: String(input.release), reason: input.reason.slice(0, 200) },
  };
}
