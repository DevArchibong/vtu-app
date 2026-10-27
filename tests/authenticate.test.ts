
import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { createAccessToken } from "../src/lib/tokens.js";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../src/middleware/authenticate.js";

const testApp = express();

testApp.get(
  "/protected",
  authenticate,
  (req: AuthenticatedRequest, res) => {
    res.status(200).json({ user: req.user });
  },
);

describe("Authentication middleware", () => {
  it("rejects a request without an access token", async () => {
    const response = await request(testApp).get("/protected");

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Authentication required.");
  });

  it("rejects an invalid access token", async () => {
    const response = await request(testApp)
      .get("/protected")
      .set("Authorization", "Bearer invalid.token.value");

    expect(response.status).toBe(401);
    expect(response.body.error).toBe(
      "Invalid or expired access token.",
    );
  });

  it("accepts a valid access token and identifies the user", async () => {
    const token = createAccessToken("test-user-123", "CUSTOMER");

    const response = await request(testApp)
      .get("/protected")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({
      id: "test-user-123",
      role: "CUSTOMER",
    });
  });
});
