
import { afterAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app.ts";
import { prisma } from "../src/lib/prisma.ts";

const suffix = Date.now().toString().slice(-8);
const phoneNumber = `080${suffix}`;
const normalizedPhone = `+23480${suffix}`;

describe("POST /api/auth/register", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { phoneNumber: normalizedPhone },
    });
    await prisma.$disconnect();
  });

  it("registers a customer without an email", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        fullName: "Test Customer",
        phoneNumber,
        password: "TestPassword123!",
      });

    expect(response.status).toBe(201);
    expect(response.body.user.fullName).toBe("Test Customer");
    expect(response.body.user.phoneNumber).toBe(normalizedPhone);
    expect(response.body.user.email).toBeNull();
    expect(response.body.user.phoneVerifiedAt).toBeNull();
    expect(response.body.user).not.toHaveProperty("passwordHash");
  });

  it("rejects a duplicate phone number", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        fullName: "Another Customer",
        phoneNumber,
        password: "AnotherPassword123!",
      });

    expect(response.status).toBe(409);
    expect(response.body).toHaveProperty("error");
  });

  it("rejects an invalid phone number", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        fullName: "Invalid Customer",
        phoneNumber: "12345",
        password: "TestPassword123!",
      });

    expect(response.status).toBe(400);
  });

  it("rejects a password that is too short", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        fullName: "Weak Password Customer",
        phoneNumber: "08012345679",
        password: "short",
      });

    expect(response.status).toBe(400);
  });
});
