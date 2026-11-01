import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Ticket credentials.
 *  - credential: 256-bit random, base64url (43 chars). Encoded in the QR code.
 *    Contains no personal data and no database id.
 *  - hash: SHA-256 hex of the credential; the only form used for lookup.
 *  - ciphertext: AES-256-GCM of the credential with TICKET_CREDENTIAL_KEY
 *    (held only by the app server), so the guest ticket page and email retries
 *    can re-render the QR without the database ever holding it in plaintext.
 */

const CREDENTIAL_BYTES = 32;
const CIPHER_VERSION = "v1";

export function generateCredential(): string {
  return randomBytes(CREDENTIAL_BYTES).toString("base64url");
}

export function isWellFormedCredential(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function hashCredential(credential: string): string {
  return createHash("sha256").update(credential, "utf8").digest("hex");
}

function keyFrom(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) throw new Error("TICKET_CREDENTIAL_KEY must decode to 32 bytes");
  return key;
}

export function encryptCredential(credential: string, base64Key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(base64Key), iv);
  const body = Buffer.concat([cipher.update(credential, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [CIPHER_VERSION, iv.toString("base64url"), body.toString("base64url"), tag.toString("base64url")].join(".");
}

export function decryptCredential(payload: string, base64Key: string): string {
  const [version, iv, body, tag] = payload.split(".");
  if (version !== CIPHER_VERSION || !iv || !body || !tag) throw new Error("Unsupported credential ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(base64Key), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
}

// 32 symbols (no 0/O/1/I) => each random byte maps without modulo bias (256 % 32 === 0).
const MANUAL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Short code printed on tickets for staff manual lookup. Not an entry credential. */
export function generateManualCode(): string {
  return Array.from(randomBytes(8), (b) => MANUAL_ALPHABET[b % 32]).join("");
}

/** Random token for guest order-status URLs; store only its hash. */
export function generatePublicToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashCredential(token) };
}

/** Rate-limit key: HMAC of client IP so raw IPs are never stored. */
export function rateLimitKey(ip: string, salt: string): string {
  return createHmac("sha256", salt).update(ip).digest("hex");
}

export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
