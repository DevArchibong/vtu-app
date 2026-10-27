
import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";
import { createAccessToken } from "../src/lib/tokens.js";

describe("GET /api/me", () => {
  it("rejects a request without an access token", async () => {
    const response = await request(app).get("/api/me");

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Authentication required.");
  });

  it("rejects an invalid access token", async () => {
    const response = await request(app)
      .get("/api/me")
      .set("Authorization", "Bearer invalid.token.value");

    expect(response.status).toBe(401);
    expect(response.body.error).toBe(
      "Invalid or expired access token.",
    );
  });

  it("returns the authenticated user's identity", async () => {
    const token = createAccessToken("profile-test-user", "CUSTOMER");

    const response = await request(app)
      .get("/api/me")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({
      id: "profile-test-user",
      role: "CUSTOMER",
    });
  });
});
