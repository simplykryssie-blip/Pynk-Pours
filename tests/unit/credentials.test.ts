import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  constantTimeEqual, decryptCredential, encryptCredential, generateCredential, generateManualCode,
  generatePublicToken, hashCredential, isWellFormedCredential, rateLimitKey,
} from "@/server/credentials";

const key = randomBytes(32).toString("base64");

describe("ticket credentials", () => {
  it("are 256-bit, URL-safe, unique", () => {
    const set = new Set(Array.from({ length: 2000 }, generateCredential));
    expect(set.size).toBe(2000);
    for (const c of set) expect(isWellFormedCredential(c)).toBe(true);
    expect(Buffer.from([...set][0], "base64url")).toHaveLength(32);
  });

  it("hash is SHA-256 hex and deterministic", () => {
    const c = generateCredential();
    expect(hashCredential(c)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCredential(c)).toBe(hashCredential(c));
    expect(hashCredential(c)).not.toBe(hashCredential(generateCredential()));
  });

  it("encrypts/decrypts with AES-GCM; ciphertext never contains the credential", () => {
    const c = generateCredential();
    const enc = encryptCredential(c, key);
    expect(enc).not.toContain(c);
    expect(enc).toMatch(/^v1\./);
    expect(decryptCredential(enc, key)).toBe(c);
    expect(encryptCredential(c, key)).not.toBe(enc); // random IV
  });

  it("rejects tampered ciphertext and wrong keys", () => {
    const enc = encryptCredential(generateCredential(), key);
    const parts = enc.split(".");
    parts[2] = Buffer.from("tampered!").toString("base64url");
    expect(() => decryptCredential(parts.join("."), key)).toThrow();
    expect(() => decryptCredential(enc, randomBytes(32).toString("base64"))).toThrow();
    expect(() => encryptCredential("x", randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
  });

  it("rejects malformed credentials before any lookup", () => {
    for (const bad of ["", "short", "a".repeat(44), "has space".padEnd(43, "x"), "../../etc/passwd".padEnd(43, "x")]) {
      expect(isWellFormedCredential(bad)).toBe(false);
    }
  });
});

describe("other tokens", () => {
  it("manual codes use the unambiguous alphabet and match the DB constraint", () => {
    for (let i = 0; i < 500; i++) expect(generateManualCode()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });

  it("public order tokens are random and returned with their hash", () => {
    const a = generatePublicToken();
    expect(a.hash).toBe(hashCredential(a.token));
    expect(generatePublicToken().token).not.toBe(a.token);
  });

  it("rate-limit keys are salted HMACs, not raw IPs", () => {
    const k = rateLimitKey("203.0.113.7", "s".repeat(32));
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(k).not.toContain("203");
    expect(rateLimitKey("203.0.113.7", "t".repeat(32))).not.toBe(k);
  });

  it("constant-time compare", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });
});
