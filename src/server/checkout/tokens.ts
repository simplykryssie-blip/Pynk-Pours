import "server-only";
import { createHmac } from "node:crypto";
import { hashCredential, ticketKeyBytes } from "../credentials";
import { envSubset } from "../env";

/**
 * The guest's private order link token. Derived (HMAC) from the form's
 * idempotency key with a server-only secret, so a retried submission maps to
 * the same order link, while nobody without the secret can compute it.
 */
export function orderTokenFor(idempotencyKey: string): { token: string; hash: string } {
  const { TICKET_CREDENTIAL_KEY } = envSubset(["TICKET_CREDENTIAL_KEY"]);
  const token = createHmac("sha256", ticketKeyBytes(TICKET_CREDENTIAL_KEY)).update(`order-link:${idempotencyKey}`).digest("base64url");
  return { token, hash: hashCredential(token) };
}

export const isOrderToken = (t: string) => /^[A-Za-z0-9_-]{43}$/.test(t);
