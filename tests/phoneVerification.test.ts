
import { describe, expect, it } from "vitest";
import {
  generateVerificationCode,
  hashVerificationCode,
  verifyCodeHash,
} from "../src/lib/phoneVerification.js";

describe("Phone verification utilities", () => {
  it("generates a six-digit code", () => {
    const code = generateVerificationCode();

    expect(code).toMatch(/^\d{6}$/);
  });

  it("hashes a code consistently", () => {
    const firstHash = hashVerificationCode("012345");
    const secondHash = hashVerificationCode("012345");

    expect(firstHash).toBe(secondHash);
    expect(firstHash).not.toBe("012345");
  });

  it("accepts the correct code", () => {
    const code = "012345";
    const hash = hashVerificationCode(code);

    expect(verifyCodeHash(code, hash)).toBe(true);
  });

  it("rejects an incorrect code", () => {
    const hash = hashVerificationCode("012345");

    expect(verifyCodeHash("123456", hash)).toBe(false);
  });

  it("rejects malformed codes and hashes", () => {
    expect(verifyCodeHash("12345", "invalid")).toBe(false);
    expect(verifyCodeHash("abcdef", "invalid")).toBe(false);
  });
});
