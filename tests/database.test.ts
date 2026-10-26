
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma";

describe("Database connection", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("connects to PostgreSQL", async () => {
    await expect(prisma.$connect()).resolves.toBeUndefined();
  });
});
