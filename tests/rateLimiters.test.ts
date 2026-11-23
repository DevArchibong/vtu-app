

import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";

import {
  createRateLimiter,
  identityVerificationRateLimiter,
} from "../src/middleware/rateLimiters.js";

describe("Rate limiter", () => {
  it("returns HTTP 429 when the request limit is exceeded", async () => {
    const testApp = express();

    testApp.use(createRateLimiter(2));

    testApp.get("/test", (_req, res) => {
      res.status(200).json({
        message: "Request successful.",
      });
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

  it("allows five identity verification requests and blocks the sixth", async () => {
    const testApp = express();

    testApp.use(identityVerificationRateLimiter);

    testApp.post("/api/identity/verify", (_req, res) => {
      res.status(200).json({
        message: "Identity verification request accepted.",
      });
    });

    const responses = [];

    for (let i = 0; i < 6; i++) {
      responses.push(
        await request(testApp).post("/api/identity/verify"),
      );
    }

    expect(responses[0].status).toBe(200);
    expect(responses[1].status).toBe(200);
    expect(responses[2].status).toBe(200);
    expect(responses[3].status).toBe(200);
    expect(responses[4].status).toBe(200);
    expect(responses[5].status).toBe(429);

    expect(responses[5].body.error).toBe(
      "Too many requests. Please try again later.",
    );
  });
});
