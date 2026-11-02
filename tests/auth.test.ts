import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app.ts";
import { prisma } from "../src/lib/prisma.ts";

const suffix = Date.now().toString().slice(-8);
const phoneNumber = `070${suffix}`;
const normalizedPhone = `+23470${suffix}`;

// Remove the wallet before deleting its associated test customer.
async function cleanupTestCustomer() {
  const user = await prisma.user.findUnique({
    where: { phoneNumber: normalizedPhone },
    select: { id: true },
  });

  if (user) {
    await prisma.wallet.deleteMany({
      where: { userId: user.id },
    });

    await prisma.user.deleteMany({
      where: { id: user.id },
    });
  }
}

describe("POST /api/auth/register", () => {
  beforeAll(async () => {
    // Remove any stale test customer before starting.
    await cleanupTestCustomer();
  });

  afterAll(async () => {
    // Clean up the test customer and its wallet.
    await cleanupTestCustomer();

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

    // Confirm that registration automatically creates a zero-balance wallet.
    const wallet = await prisma.wallet.findUnique({
      where: { userId: response.body.user.id },
    });

    expect(wallet).not.toBeNull();
    expect(wallet?.balanceKobo).toBe(0);
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