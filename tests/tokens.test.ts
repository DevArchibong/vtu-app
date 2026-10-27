
import { afterEach, describe, expect, it, vi } from "vitest";

describe("Access token utilities", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("creates and verifies a valid access token", async () => {
    vi.stubEnv("JWT_ACCESS_SECRET", "a".repeat(64));

    const { createAccessToken, verifyAccessToken } = await import(
      "../src/lib/tokens.js"
    );

    const token = createAccessToken("user-123", "CUSTOMER");
    const payload = verifyAccessToken(token);

    expect(payload.sub).toBe("user-123");
    expect(payload.role).toBe("CUSTOMER");
    expect(payload.exp).toBeTypeOf("number");

    vi.unstubAllEnvs();
  });

  it("rejects a token with an invalid signature", async () => {
    vi.stubEnv("JWT_ACCESS_SECRET", "a".repeat(64));

    const { verifyAccessToken } = await import("../src/lib/tokens.js");

    expect(() => verifyAccessToken("invalid.token.value")).toThrow();

    vi.unstubAllEnvs();
  });

  it("rejects a token signed with another secret", async () => {
    vi.stubEnv("JWT_ACCESS_SECRET", "a".repeat(64));

    const jwt = await import("jsonwebtoken");
    const { verifyAccessToken } = await import("../src/lib/tokens.js");

    const token = jwt.default.sign(
      { role: "CUSTOMER" },
      "b".repeat(64),
      {
        subject: "user-123",
        expiresIn: "15m",
        issuer: "vtu-app",
        audience: "vtu-app-api",
        algorithm: "HS256",
      },
    );

    expect(() => verifyAccessToken(token)).toThrow();

    vi.unstubAllEnvs();
  });
});
