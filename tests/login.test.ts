
import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";

const suffix = Date.now().toString().slice(-8);
const phoneNumber = `080${suffix}`;
const normalizedPhone = `+23480${suffix}`;
const password = "TestPassword123!";

describe("POST /api/auth/login", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { phoneNumber: normalizedPhone },
    });
    await prisma.$disconnect();
  });

  it("logs in a verified customer with the correct password", async () => {
    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.user.create({
      data: {
        fullName: "Verified Test Customer",
        phoneNumber: normalizedPhone,
        passwordHash,
        phoneVerifiedAt: new Date(),
      },
    });

    const response = await request(app)
      .post("/api/auth/login")
      .send({ phoneNumber, password });

    expect(response.status).toBe(200);
    expect(response.body.user.phoneNumber).toBe(normalizedPhone);
    expect(response.body.user).not.toHaveProperty("passwordHash");
  });

  it("rejects an incorrect password", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({
        phoneNumber,
        password: "WrongPassword123!",
      });

    expect(response.status).toBe(401);
  });

  it("rejects an unverified customer", async () => {
    const unverifiedPhone = `+23481${suffix}`;

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

    await prisma.user.deleteMany({
      where: { phoneNumber: unverifiedPhone },
    });
  });
});
