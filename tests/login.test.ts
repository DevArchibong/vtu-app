
import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { verifyAccessToken } from "../src/lib/tokens.js";

const suffix = Date.now().toString().slice(-8);
const phoneNumber = `080${suffix}`;
const normalizedPhone = `+23480${suffix}`;
const password = "TestPassword123!";
const unverifiedPhone = `+23481${suffix}`;

describe("POST /api/auth/login", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        phoneNumber: {
          in: [normalizedPhone, unverifiedPhone],
        },
      },
    });

    await prisma.$disconnect();
  });

  it("logs in a verified customer and returns a valid access token", async () => {
    await prisma.user.create({
      data: {
        fullName: "Verified Test Customer",
        phoneNumber: normalizedPhone,
        passwordHash: await bcrypt.hash(password, 10),
        phoneVerifiedAt: new Date(),
      },
    });

    const response = await request(app)
      .post("/api/auth/login")
      .send({ phoneNumber, password });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe("Login successful.");
    expect(response.body.tokenType).toBe("Bearer");
    expect(response.body.expiresIn).toBe(900);
    expect(response.body.accessToken).toBeTypeOf("string");
    expect(response.body.user.phoneNumber).toBe(normalizedPhone);
    expect(response.body.user).not.toHaveProperty("passwordHash");

    const payload = verifyAccessToken(response.body.accessToken);

    expect(payload.sub).toBe(response.body.user.id);
    expect(payload.role).toBe("CUSTOMER");
  });

  it("rejects an incorrect password without issuing a token", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({
        phoneNumber,
        password: "WrongPassword123!",
      });

    expect(response.status).toBe(401);
    expect(response.body).not.toHaveProperty("accessToken");
  });

  it("rejects an unverified customer without issuing a token", async () => {
    await prisma.user.create({
      data: {
        fullName: "Unverified Test Customer",
        phoneNumber: unverifiedPhone,
        passwordHash: await bcrypt.hash(password, 10),
      },
    });

    const response = await request(app)
      .post("/api/auth/login")
      .send({
        phoneNumber: `081${suffix}`,
        password,
      });

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("PHONE_NOT_VERIFIED");
    expect(response.body).not.toHaveProperty("accessToken");
  });
});
