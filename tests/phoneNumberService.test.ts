import { describe, expect, it } from "vitest";
import {
  normalizePhoneNumber,
  isValidNigerianPhoneNumber,
  detectNetwork,
} from "../src/services/phoneNumberService";
import { resolveNetwork } from "../src/services/phoneNumberService";

describe("Phone number service", () => {
  describe("normalizePhoneNumber", () => {
    it("normalizes a local Nigerian number", () => {
      expect(normalizePhoneNumber("08031234567")).toBe(
        "+2348031234567",
      );
    });

    it("normalizes a number beginning with 234", () => {
      expect(normalizePhoneNumber("2348031234567")).toBe(
        "+2348031234567",
      );
    });

    it("accepts an international Nigerian number", () => {
      expect(normalizePhoneNumber("+2348031234567")).toBe(
        "+2348031234567",
      );
    });

    it("removes spaces, brackets and hyphens", () => {
      expect(normalizePhoneNumber("0803 123 4567")).toBe(
        "+2348031234567",
      );

      expect(normalizePhoneNumber("0803-123-4567")).toBe(
        "+2348031234567",
      );

      expect(normalizePhoneNumber("(0803) 123-4567")).toBe(
        "+2348031234567",
      );
    });

    it("rejects invalid phone number formats", () => {
      expect(normalizePhoneNumber("0803123456")).toBeNull();
      expect(normalizePhoneNumber("080312345678")).toBeNull();
      expect(normalizePhoneNumber("12345678901")).toBeNull();
      expect(normalizePhoneNumber("+441234567890")).toBeNull();
      expect(normalizePhoneNumber("")).toBeNull();
    });
  });

  describe("isValidNigerianPhoneNumber", () => {
    it("accepts a valid Nigerian mobile number", () => {
      expect(isValidNigerianPhoneNumber("08031234567")).toBe(true);
    });

    it("rejects an invalid Nigerian mobile number", () => {
      expect(isValidNigerianPhoneNumber("12345678901")).toBe(false);
    });
  });

  describe("detectNetwork", () => {
    it("detects MTN prefixes", () => {
      expect(detectNetwork("08031234567")).toBe("MTN");
      expect(detectNetwork("07031234567")).toBe("MTN");
    });

    it("detects Airtel prefixes", () => {
      expect(detectNetwork("08021234567")).toBe("AIRTEL");
      expect(detectNetwork("09021234567")).toBe("AIRTEL");
    });

    it("detects Glo prefixes", () => {
      expect(detectNetwork("08051234567")).toBe("GLO");
      expect(detectNetwork("08151234567")).toBe("GLO");
    });

    it("detects 9mobile prefixes", () => {
      expect(detectNetwork("08091234567")).toBe("9MOBILE");
      expect(detectNetwork("09091234567")).toBe("9MOBILE");
    });

    it("returns null for an invalid number", () => {
      expect(detectNetwork("12345678901")).toBeNull();
    });

    it("returns null for a valid format with an unrecognized prefix", () => {
      expect(detectNetwork("07021234567")).toBeNull();
    });

    it("detects the same network from local and international formats", () => {
      expect(detectNetwork("08031234567")).toBe("MTN");
      expect(detectNetwork("+2348031234567")).toBe("MTN");
      expect(detectNetwork("2348031234567")).toBe("MTN");
    });
  });
});

describe("resolveNetwork", () => {
    it("uses the estimated network when no manual selection is provided", () => {
      const result = resolveNetwork("08031234567");
  
      expect(result?.estimatedNetwork).toBe("MTN");
      expect(result?.resolvedNetwork).toBe("MTN");
      expect(result?.isMismatch).toBe(false);
    });
  
    it("uses the manually selected network when it matches the estimate", () => {
      const result = resolveNetwork("08031234567", "MTN");
  
      expect(result?.resolvedNetwork).toBe("MTN");
      expect(result?.isMismatch).toBe(false);
    });
  
    it("prioritizes manual selection when it differs from the estimate", () => {
      const result = resolveNetwork("08031234567", "AIRTEL");
  
      expect(result?.estimatedNetwork).toBe("MTN");
      expect(result?.selectedNetwork).toBe("AIRTEL");
      expect(result?.resolvedNetwork).toBe("AIRTEL");
      expect(result?.isMismatch).toBe(true);
    });
  
    it("allows manual selection when the prefix is unrecognized", () => {
      const result = resolveNetwork("07021234567", "GLO");
  
      expect(result?.estimatedNetwork).toBeNull();
      expect(result?.resolvedNetwork).toBe("GLO");
      expect(result?.isMismatch).toBe(false);
    });
  
    it("does not guess a network when the prefix is unrecognized", () => {
      const result = resolveNetwork("07021234567");
  
      expect(result?.estimatedNetwork).toBeNull();
      expect(result?.resolvedNetwork).toBeNull();
    });
  
    it("rejects an invalid phone number", () => {
      expect(resolveNetwork("12345678901", "MTN")).toBeNull();
    });
  });