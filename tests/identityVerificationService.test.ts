
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { prisma } from "../src/lib/prisma.js";

import {
  verifyCustomerIdentity as verifyCustomerIdentityService,
} from "../src/services/identityVerificationService.js";

import type {
  IdentityType,
  IdentityVerificationProvider,
  IdentityVerificationProviderResult,
  VerifyIdentityInput,
} from "../src/providers/identityVerificationProvider.js";

const providerCode = "mock-kyc-provider";

let testUserIds: string[] = [];
let userCounter = 0;

// Supplies the new privacy acknowledgement argument
// without requiring changes to every existing test call.
async function verifyCustomerIdentity(
  userId: string,
  identityType: IdentityType,
  identityNumber: string,
  provider: IdentityVerificationProvider,
  privacyNoticeAcknowledged = true,
) {
  return verifyCustomerIdentityService(
    userId,
    identityType,
    identityNumber,
    provider,
    privacyNoticeAcknowledged,
  );
}

async function createTestUser(): Promise<string> {
  userCounter++;

  const user = await prisma.user.create({
    data: {
      fullName: "Identity Test User",
      phoneNumber: `+23480${Date.now().toString().slice(-7)}${userCounter}`,
      passwordHash: "test-password-hash",
    },
  });

  testUserIds.push(user.id);
  return user.id;
}

function createMockProvider(
  implementation?: (
    input: VerifyIdentityInput,
  ) => Promise<IdentityVerificationProviderResult>,
): IdentityVerificationProvider {
  return {
    providerCode,

    verifyIdentity: vi.fn(
      implementation ??
        (async () => ({
          providerCode,
          providerReference: `mock-ref-${Date.now()}`,
          status: "VERIFIED" as const,
        })),
    ),
  };
}

beforeAll(() => {
  if (!process.env.IDENTITY_FINGERPRINT_SECRET) {
    throw new Error(
      "IDENTITY_FINGERPRINT_SECRET must be configured for these tests.",
    );
  }

  // Test-only compliance configuration.
  // This does not establish the production lawful basis.
  process.env.KYC_LAWFUL_BASIS = "CONSENT";
  process.env.KYC_PRIVACY_NOTICE_VERSION = "test-v1";
});

afterEach(async () => {
  for (const userId of testUserIds) {
    await prisma.identityVerification.deleteMany({
      where: { userId },
    });

    await prisma.user.delete({
      where: { id: userId },
    });
  }

  testUserIds = [];
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Identity verification service", () => {
  it("verifies a customer's NIN successfully", async () => {
    const userId = await createTestUser();
    const provider = createMockProvider();

    const result = await verifyCustomerIdentity(
      userId,
      "NIN",
      "12345678901",
      provider,
    );

    expect(result).toMatchObject({
      identityType: "NIN",
      status: "VERIFIED",
      message: "Identity verified successfully.",
    });

    expect(result.verificationId).toBeTruthy();

    const record = await prisma.identityVerification.findUnique({
      where: { id: result.verificationId },
    });

    expect(record?.identityFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(record?.identityFingerprint).not.toBe("12345678901");
    expect(record?.privacyNoticeVersion).toBe("test-v1");
    expect(record?.lawfulBasis).toBe("CONSENT");
    expect(record?.noticeAcknowledgedAt).toBeInstanceOf(Date);
    expect(record?.consentedAt).toBeInstanceOf(Date);
  });

  it("rejects an identity number that is not 11 digits", async () => {
    const userId = await createTestUser();
    const provider = createMockProvider();

    await expect(
      verifyCustomerIdentity(
        userId,
        "NIN",
        "12345",
        provider,
      ),
    ).rejects.toMatchObject({
      code: "INVALID_IDENTITY_NUMBER",
    });

    expect(provider.verifyIdentity).not.toHaveBeenCalled();
  });

  it("rejects an invalid identity type", async () => {
    const userId = await createTestUser();
    const provider = createMockProvider();

    await expect(
      verifyCustomerIdentity(
        userId,
        "INVALID" as IdentityType,
        "12345678901",
        provider,
      ),
    ).rejects.toMatchObject({
      code: "INVALID_IDENTITY_TYPE",
    });

    expect(provider.verifyIdentity).not.toHaveBeenCalled();
  });

  it("rejects verification for a user who does not exist", async () => {
    const provider = createMockProvider();

    await expect(
      verifyCustomerIdentity(
        "non-existent-user-id",
        "NIN",
        "12345678901",
        provider,
      ),
    ).rejects.toMatchObject({
      code: "USER_NOT_FOUND",
    });

    expect(provider.verifyIdentity).not.toHaveBeenCalled();
  });

  it("rejects verification without privacy notice acknowledgement", async () => {
    const userId = await createTestUser();
    const provider = createMockProvider();

    await expect(
      verifyCustomerIdentity(
        userId,
        "NIN",
        "12345678901",
        provider,
        false,
      ),
    ).rejects.toMatchObject({
      code: "PRIVACY_NOTICE_ACKNOWLEDGEMENT_REQUIRED",
    });

    expect(provider.verifyIdentity).not.toHaveBeenCalled();

    const record = await prisma.identityVerification.findFirst({
      where: { userId },
    });

    expect(record).toBeNull();
  });

  it("rejects verification when compliance configuration is missing", async () => {
    const userId = await createTestUser();
    const provider = createMockProvider();

    const originalLawfulBasis = process.env.KYC_LAWFUL_BASIS;
    const originalNoticeVersion =
      process.env.KYC_PRIVACY_NOTICE_VERSION;

    delete process.env.KYC_LAWFUL_BASIS;
    delete process.env.KYC_PRIVACY_NOTICE_VERSION;

    try {
      await expect(
        verifyCustomerIdentity(
          userId,
          "NIN",
          "12345678901",
          provider,
          true,
        ),
      ).rejects.toMatchObject({
        code: "IDENTITY_COMPLIANCE_CONFIGURATION_ERROR",
      });

      expect(provider.verifyIdentity).not.toHaveBeenCalled();

      const record = await prisma.identityVerification.findFirst({
        where: { userId },
      });

      expect(record).toBeNull();
    } finally {
      if (originalLawfulBasis === undefined) {
        delete process.env.KYC_LAWFUL_BASIS;
      } else {
        process.env.KYC_LAWFUL_BASIS = originalLawfulBasis;
      }

      if (originalNoticeVersion === undefined) {
        delete process.env.KYC_PRIVACY_NOTICE_VERSION;
      } else {
        process.env.KYC_PRIVACY_NOTICE_VERSION =
          originalNoticeVersion;
      }
    }
  });

  it("rejects a retry using a different identity number", async () => {
    const userId = await createTestUser();

    const provider = createMockProvider(async () => {
      throw new Error("Simulated provider timeout");
    });

    await expect(
      verifyCustomerIdentity(
        userId,
        "NIN",
        "12345678901",
        provider,
      ),
    ).rejects.toMatchObject({
      code: "IDENTITY_PROVIDER_UNAVAILABLE",
    });

    await expect(
      verifyCustomerIdentity(
        userId,
        "NIN",
        "98765432109",
        provider,
      ),
    ).rejects.toMatchObject({
      code: "IDENTITY_NUMBER_MISMATCH",
    });

    expect(provider.verifyIdentity).toHaveBeenCalledTimes(1);
  });

  it("preserves a pending record when the provider times out", async () => {
    const userId = await createTestUser();

    const provider = createMockProvider(async () => {
      throw new Error("Simulated provider timeout");
    });

    await expect(
      verifyCustomerIdentity(
        userId,
        "BVN",
        "12345678901",
        provider,
      ),
    ).rejects.toMatchObject({
      code: "IDENTITY_PROVIDER_UNAVAILABLE",
    });

    const record = await prisma.identityVerification.findFirst({
      where: {
        userId,
        identityType: "BVN",
      },
    });

    expect(record).not.toBeNull();
    expect(record?.status).toBe("PENDING");
    expect(record?.identityFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("reuses the pending record and idempotency key on retry", async () => {
    const userId = await createTestUser();

    const receivedInputs: VerifyIdentityInput[] = [];

    const provider = createMockProvider(async (input) => {
      receivedInputs.push(input);

      if (receivedInputs.length === 1) {
        throw new Error("Simulated provider timeout");
      }

      return {
        providerCode,
        providerReference: "mock-retry-reference",
        status: "VERIFIED",
      };
    });

    await expect(
      verifyCustomerIdentity(
        userId,
        "NIN",
        "12345678901",
        provider,
      ),
    ).rejects.toMatchObject({
      code: "IDENTITY_PROVIDER_UNAVAILABLE",
    });

    const firstRecord = await prisma.identityVerification.findFirst({
      where: { userId, identityType: "NIN" },
    });

    const result = await verifyCustomerIdentity(
      userId,
      "NIN",
      "12345678901",
      provider,
    );

    const secondRecord = await prisma.identityVerification.findFirst({
      where: { userId, identityType: "NIN" },
    });

    expect(result.status).toBe("VERIFIED");
    expect(secondRecord?.id).toBe(firstRecord?.id);
    expect(receivedInputs).toHaveLength(2);
    expect(receivedInputs[0].idempotencyKey).toBe(
      receivedInputs[1].idempotencyKey,
    );
  });

  it("prevents a customer from verifying again after success", async () => {
    const userId = await createTestUser();
    const provider = createMockProvider();

    await verifyCustomerIdentity(
      userId,
      "NIN",
      "12345678901",
      provider,
    );

    await expect(
      verifyCustomerIdentity(
        userId,
        "BVN",
        "98765432109",
        provider,
      ),
    ).rejects.toMatchObject({
      code: "IDENTITY_ALREADY_VERIFIED",
    });

    expect(provider.verifyIdentity).toHaveBeenCalledTimes(1);
  });

  it("rejects a provider response with the wrong provider code", async () => {
    const userId = await createTestUser();

    const provider = createMockProvider(async () => ({
      providerCode: "unexpected-provider",
      providerReference: "mock-reference",
      status: "VERIFIED",
    }));

    await expect(
      verifyCustomerIdentity(
        userId,
        "NIN",
        "12345678901",
        provider,
      ),
    ).rejects.toMatchObject({
      code: "INVALID_PROVIDER_RESPONSE",
    });

    const record = await prisma.identityVerification.findFirst({
      where: { userId },
    });

    expect(record?.status).toBe("PENDING");
  });

  it("rejects a provider response with an unsupported status", async () => {
    const userId = await createTestUser();

    const provider = createMockProvider(async () => ({
      providerCode,
      providerReference: "mock-invalid-status",
      status: "SUCCESS",
    } as unknown as IdentityVerificationProviderResult));

    await expect(
      verifyCustomerIdentity(
        userId,
        "NIN",
        "12345678901",
        provider,
      ),
    ).rejects.toMatchObject({
      code: "INVALID_PROVIDER_RESPONSE",
    });

    const record = await prisma.identityVerification.findFirst({
      where: { userId },
    });

    expect(record?.status).toBe("PENDING");
  });

  it("rejects a provider response with an empty reference", async () => {
    const userId = await createTestUser();

    const provider = createMockProvider(async () => ({
      providerCode,
      providerReference: "   ",
      status: "VERIFIED",
    }));

    await expect(
      verifyCustomerIdentity(
        userId,
        "NIN",
        "12345678901",
        provider,
      ),
    ).rejects.toMatchObject({
      code: "INVALID_PROVIDER_RESPONSE",
    });

    const record = await prisma.identityVerification.findFirst({
      where: { userId },
    });

    expect(record?.status).toBe("PENDING");
  });

  it("rejects a provider response with an invalid structure", async () => {
    const userId = await createTestUser();

    const provider = createMockProvider(async () => (
      null as unknown as IdentityVerificationProviderResult
    ));

    await expect(
      verifyCustomerIdentity(
        userId,
        "NIN",
        "12345678901",
        provider,
      ),
    ).rejects.toMatchObject({
      code: "INVALID_PROVIDER_RESPONSE",
    });

    const record = await prisma.identityVerification.findFirst({
      where: { userId },
    });

    expect(record?.status).toBe("PENDING");
  });

  it("rejects a provider response with a non-string failure code", async () => {
    const userId = await createTestUser();

    const provider = createMockProvider(async () => ({
      providerCode,
      providerReference: "mock-invalid-failure-code",
      status: "FAILED",
      failureCode: 123,
    } as unknown as IdentityVerificationProviderResult));

    await expect(
      verifyCustomerIdentity(
        userId,
        "NIN",
        "12345678901",
        provider,
      ),
    ).rejects.toMatchObject({
      code: "INVALID_PROVIDER_RESPONSE",
    });

    const record = await prisma.identityVerification.findFirst({
      where: { userId },
    });

    expect(record?.status).toBe("PENDING");
  });
});
