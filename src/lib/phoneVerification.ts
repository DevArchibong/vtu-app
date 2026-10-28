
import { createHash, randomInt } from "node:crypto";

/**
 * Generates a cryptographically secure six-digit verification code.
 */
export function generateVerificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/**
 * Hashes a verification code before it is stored in the database.
 */
export function hashVerificationCode(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

/**
 * Compares a submitted code with its stored hash.
 */
export function verifyCodeHash(
  submittedCode: string,
  storedHash: string,
): boolean {
  if (!/^\d{6}$/.test(submittedCode)) {
    return false;
  }

  if (!/^[a-f0-9]{64}$/i.test(storedHash)) {
    return false;
  }

  const submittedHash = hashVerificationCode(submittedCode);

  return submittedHash === storedHash.toLowerCase();
}
