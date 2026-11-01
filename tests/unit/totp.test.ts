import { describe, expect, it } from "vitest";
import { totp } from "../e2e/totp";

describe("test TOTP helper", () => {
  it("matches the RFC 6238 SHA-1 test vectors", () => {
    // RFC 6238 Appendix B secret "12345678901234567890" in base32:
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(totp(secret, 59_000)).toBe("287082");
    expect(totp(secret, 1_111_111_109_000)).toBe("081804");
    expect(totp(secret, 2_000_000_000_000)).toBe("279037");
  });
});
