
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
  import { hashVerificationCode } from "../src/lib/phoneVerification.js";
  
  const phoneNumber = `+23491${Date.now().toString().slice(-8)}`;
  
  let userId: string;
  let accessToken: string;
  
  describe("Phone verification routes", () => {
    beforeAll(async () => {
      const user = await prisma.user.create({
        data: {
          fullName: "Phone Verification Route Test",
          phoneNumber,
          passwordHash: "test-only-password-hash",
        },
      });
  
      userId = user.id;
      accessToken = createAccessToken(user.id, "CUSTOMER");
    });
  
    afterAll(async () => {
      await prisma.phoneVerification.deleteMany({
        where: { userId },
      });
  
      await prisma.user.deleteMany({
        where: { id: userId },
      });
  
      await prisma.$disconnect();
    });
  
    it("returns 400 for a malformed verification code", async () => {
      const response = await request(app)
        .post("/api/auth/phone-verification/confirm")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ code: "12345" });
  
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_CODE_FORMAT");
    });
  
    it("returns 400 when no active verification code exists", async () => {
      const response = await request(app)
        .post("/api/auth/phone-verification/confirm")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ code: "123456" });
  
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("NO_ACTIVE_CODE");
    });
  
    it("returns 429 when the verification code reaches the attempt limit", async () => {
      await prisma.phoneVerification.create({
        data: {
          userId,
          codeHash: hashVerificationCode("123456"),
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          attempts: 4,
        },
      });
  
      const response = await request(app)
        .post("/api/auth/phone-verification/confirm")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ code: "999999" });
  
      expect(response.status).toBe(429);
      expect(response.body.error.code).toBe("MAX_ATTEMPTS_EXCEEDED");
  
      const verification = await prisma.phoneVerification.findFirst({
        where: { userId },
      });
  
      expect(verification!.attempts).toBe(5);
      expect(verification!.consumedAt).not.toBeNull();
    });
  });
  