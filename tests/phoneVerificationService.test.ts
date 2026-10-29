
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../src/lib/prisma.js";
import {
  confirmPhoneVerification,
  PhoneVerificationError,
  requestPhoneVerification,
} from "../src/services/phoneVerificationService.js";
import { hashVerificationCode } from "../src/lib/phoneVerification.js";

const testPhone = `+23480${Date.now().toString().slice(-8)}`;

let userId: string;

function getDevelopmentCode(
  result: Awaited<ReturnType<typeof requestPhoneVerification>>,
): string {
  if (!("developmentCode" in result)) {
    throw new Error(
      "Expected a development verification code. Ensure NODE_ENV is not production.",
    );
  }

  return result.developmentCode;
}

async function createTestUser() {
  const user = await prisma.user.create({
    data: {
      fullName: "Phone Verification Test",
      phoneNumber: testPhone,
      passwordHash: "test-only-password-hash",
    },
  });

  userId = user.id;
}

describe("Phone verification service", () => {
  beforeAll(async () => {
    await createTestUser();
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

  it("creates a verification record for an unverified user", async () => {
    const result = await requestPhoneVerification(userId);
    const code = getDevelopmentCode(result);

    expect(result.message).toBe("Verification code created.");
    expect(result.expiresInSeconds).toBe(600);
    expect(code).toMatch(/^\d{6}$/);

    const record = await prisma.phoneVerification.findFirst({
      where: { userId, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });

    expect(record).not.toBeNull();
    expect(record!.codeHash).not.toBe(code);
  });

  it("enforces the request cooldown", async () => {
    await expect(
      requestPhoneVerification(userId),
    ).rejects.toMatchObject({
      code: "REQUEST_COOLDOWN",
    });
  });

  it("records an incorrect verification attempt", async () => {
    const record = await prisma.phoneVerification.findFirst({
      where: { userId, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });

    expect(record).not.toBeNull();

    // Ensure the test code differs from the stored verification code.
    const wrongCode =
      hashVerificationCode("999999") === record!.codeHash
        ? "999998"
        : "999999";

    await expect(
      confirmPhoneVerification(userId, wrongCode),
    ).rejects.toBeInstanceOf(PhoneVerificationError);

    const updated = await prisma.phoneVerification.findUnique({
      where: { id: record!.id },
    });

    expect(updated!.attempts).toBe(1);
  });

  it("locks the verification code after five incorrect attempts", async () => {
    const attemptUser = await prisma.user.create({
      data: {
        fullName: "Attempt Limit Test",
        phoneNumber: `+23491${Date.now().toString().slice(-8)}`,
        passwordHash: "test-only-password-hash",
      },
    });

    try {
      await createVerificationForUser(attemptUser.id, "123456");

      for (let attempt = 0; attempt < 5; attempt++) {
        const expectedError =
          attempt === 4 ? "MAX_ATTEMPTS_EXCEEDED" : "INVALID_CODE";

        await expect(
          confirmPhoneVerification(attemptUser.id, "999999"),
        ).rejects.toMatchObject({
          code: expectedError,
        });
      }

      const verification = await prisma.phoneVerification.findFirst({
        where: { userId: attemptUser.id },
      });

      expect(verification).not.toBeNull();
      expect(verification!.attempts).toBe(5);
      expect(verification!.consumedAt).not.toBeNull();

      await expect(
        confirmPhoneVerification(attemptUser.id, "999999"),
      ).rejects.toMatchObject({
        code: "NO_ACTIVE_CODE",
      });
    } finally {
      await prisma.phoneVerification.deleteMany({
        where: { userId: attemptUser.id },
      });

      await prisma.user.delete({
        where: { id: attemptUser.id },
      });
    }
  });

  it("accepts the correct code and verifies the phone number", async () => {
    const secondUser = await prisma.user.create({
      data: {
        fullName: "Phone Verification Success Test",
        phoneNumber: `+23481${Date.now().toString().slice(-8)}`,
        passwordHash: "test-only-password-hash",
      },
    });

    try {
      const result = await requestPhoneVerification(secondUser.id);
      const code = getDevelopmentCode(result);

      expect(code).toMatch(/^\d{6}$/);

      const confirmation = await confirmPhoneVerification(
        secondUser.id,
        code,
      );

      expect(confirmation.message).toBe(
        "Phone number verified successfully.",
      );

      const updatedUser = await prisma.user.findUnique({
        where: { id: secondUser.id },
      });

      expect(updatedUser!.phoneVerifiedAt).not.toBeNull();

      const verification = await prisma.phoneVerification.findFirst({
        where: { userId: secondUser.id },
      });

      expect(verification!.consumedAt).not.toBeNull();

      await expect(
        confirmPhoneVerification(secondUser.id, code),
      ).rejects.toMatchObject({
        code: "PHONE_ALREADY_VERIFIED",
      });
    } finally {
      await prisma.phoneVerification.deleteMany({
        where: { userId: secondUser.id },
      });

      await prisma.user.delete({
        where: { id: secondUser.id },
      });
    }
  });

  it("allows only one successful confirmation for simultaneous requests", async () => {
    const concurrentUser = await prisma.user.create({
      data: {
        fullName: "Concurrent Verification Test",
        phoneNumber: `+23470${Date.now().toString().slice(-8)}`,
        passwordHash: "test-only-password-hash",
      },
    });

    try {
      const result = await requestPhoneVerification(concurrentUser.id);
      const code = getDevelopmentCode(result);

      expect(code).toMatch(/^\d{6}$/);

      const outcomes = await Promise.allSettled([
        confirmPhoneVerification(concurrentUser.id, code),
        confirmPhoneVerification(concurrentUser.id, code),
      ]);

      const successes = outcomes.filter(
        (outcome) => outcome.status === "fulfilled",
      );

      expect(successes).toHaveLength(1);

      const verifiedUser = await prisma.user.findUnique({
        where: { id: concurrentUser.id },
      });

      expect(verifiedUser!.phoneVerifiedAt).not.toBeNull();
    } finally {
      await prisma.phoneVerification.deleteMany({
        where: { userId: concurrentUser.id },
      });

      await prisma.user.delete({
        where: { id: concurrentUser.id },
      });
    }
  });

  it("rejects an expired code", async () => {
    const expiredUser = await prisma.user.create({
      data: {
        fullName: "Expired Code Test",
        phoneNumber: `+23490${Date.now().toString().slice(-8)}`,
        passwordHash: "test-only-password-hash",
      },
    });

    try {
      await createVerificationForUser(expiredUser.id, "123456", {
        expiresAt: new Date(Date.now() - 60_000),
      });

      await expect(
        confirmPhoneVerification(expiredUser.id, "123456"),
      ).rejects.toMatchObject({
        code: "CODE_EXPIRED",
      });
    } finally {
      await prisma.phoneVerification.deleteMany({
        where: { userId: expiredUser.id },
      });

      await prisma.user.delete({
        where: { id: expiredUser.id },
      });
    }
  });
});

async function createVerificationForUser(
  targetUserId: string,
  code: string,
  options?: { expiresAt?: Date; attempts?: number },
) {
  return prisma.phoneVerification.create({
    data: {
      userId: targetUserId,
      codeHash: hashVerificationCode(code),
      expiresAt:
        options?.expiresAt ??
        new Date(Date.now() + 10 * 60 * 1000),
      attempts: options?.attempts ?? 0,
    },
  });
}
