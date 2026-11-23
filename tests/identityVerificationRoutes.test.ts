
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import request from "supertest";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { createAccessToken } from "../src/lib/tokens.js";

const phoneNumber = `+23491${Date.now().toString().slice(-8)}`;

let accessToken: string;

describe("Identity verification routes", () => {
  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        fullName: "Identity Route Test",
        phoneNumber,
        passwordHash: "test-only-password-hash",
      },
    });

    accessToken = createAccessToken(user.id, "CUSTOMER");
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { phoneNumber },
    });

    await prisma.$disconnect();
  });

  it("returns 401 when authentication is missing", async () => {
    const response = await request(app)
      .post("/api/identity/verify")
      .send({
        identityType: "NIN",
        identityNumber: "12345678901",
      });

    expect(response.status).toBe(401);
  });

  it("returns 400 for an invalid identity type", async () => {
    const response = await request(app)
      .post("/api/identity/verify")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        identityType: "PASSPORT",
        identityNumber: "12345678901",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_REQUEST");
  });

  it("returns 400 when the identity number is missing", async () => {
    const response = await request(app)
      .post("/api/identity/verify")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        identityType: "NIN",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_REQUEST");
  });

  it("returns 503 when no identity provider is configured", async () => {
    const response = await request(app)
      .post("/api/identity/verify")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        identityType: "NIN",
        identityNumber: "12345678901",
        privacyNoticeAcknowledged: true,
      });

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe(
      "IDENTITY_PROVIDER_UNAVAILABLE",
    );
  });
});
