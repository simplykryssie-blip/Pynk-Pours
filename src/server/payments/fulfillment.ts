import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptCredential, generateCredential, generateManualCode, hashCredential } from "../credentials";

export interface PaymentFacts {
  provider: "stripe" | "free";
  checkout_session_id?: string | null;
  payment_intent_id?: string | null;
  amount_total?: number | null;
  currency?: string | null;
}

export interface FulfilResult { outcome: string; reason?: string; order_id?: string; ticket_ids?: string[] }

/**
 * Issue one ticket per attendee (tables: one per guest) and mark the order
 * paid — atomically, inside fulfill_order(). Safe to call repeatedly: a second
 * call for a paid order is a no-op ("already_fulfilled").
 * Only the SHA-256 hash and an AES-GCM ciphertext of each credential are stored.
 */
export async function fulfilOrder(db: SupabaseClient, orderId: string, payment: PaymentFacts, credentialKey: string): Promise<FulfilResult> {
  const { data: attendees, error } = await db.from("attendees").select("id").eq("order_id", orderId).order("position");
  if (error) throw new Error(`fulfil: attendees lookup failed: ${error.message}`);
  for (let attempt = 0; attempt < 3; attempt++) {
    const tickets = (attendees ?? []).map((a) => {
      const credential = generateCredential();
      return {
        attendee_id: a.id,
        credential_hash: hashCredential(credential),
        credential_ciphertext: encryptCredential(credential, credentialKey),
        manual_code: generateManualCode(),
      };
    });
    const { data, error: fErr } = await db.rpc("fulfill_order", { p_order_id: orderId, p_payment: payment, p_tickets: tickets });
    if (!fErr) return data as FulfilResult;
    // A random manual code collided (astronomically rare): try again with fresh codes.
    if (fErr.code === "23505" && /manual_code/.test(fErr.message)) continue;
    throw new Error(`fulfil: ${fErr.message}`);
  }
  throw new Error("fulfil: could not generate unique ticket codes");
}
