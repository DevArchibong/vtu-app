
import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { createRateLimiter } from "../src/middleware/rateLimiters.js";

describe("Rate limiter", () => {
  it("returns HTTP 429 when the request limit is exceeded", async () => {
    const testApp = express();

    testApp.use(
      createRateLimiter(2),
    );

    testApp.get("/test", (_req, res) => {
      res.status(200).json({ message: "Request successful." });
    });

    const firstResponse = await request(testApp).get("/test");
    const secondResponse = await request(testApp).get("/test");
    const thirdResponse = await request(testApp).get("/test");

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(thirdResponse.status).toBe(429);

    expect(thirdResponse.body.error).toBe(
      "Too many requests. Please try again later.",
    );
  });
});
