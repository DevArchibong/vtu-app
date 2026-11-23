
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "../lib/prisma.js";

import {
  getIdentityVerificationComplianceConfig,
} from "../config/identityVerification.js";

import type {
  IdentityType,
  IdentityVerificationProvider,
  IdentityVerificationProviderResult,
} from "../providers/identityVerificationProvider.js";

export class IdentityVerificationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "IdentityVerificationError";
  }
}

/**
 * Validates an external identity provider response at runtime.
 * TypeScript interfaces alone cannot validate external API responses.
 */
function isValidProviderResponse(
  result: unknown,
  expectedProviderCode: string,
): result is IdentityVerificationProviderResult {
  if (
    typeof result !== "object" ||
    result === null ||
    Array.isArray(result)
  ) {
    return false;
  }

  const response = result as Record<string, unknown>;

  const validStatuses = [
    "VERIFIED",
    "FAILED",
    "REVIEW_REQUIRED",
  ];

  return (
    typeof response.providerCode === "string" &&
    response.providerCode === expectedProviderCode &&
    typeof response.providerReference === "string" &&
    response.providerReference.trim().length > 0 &&
    typeof response.status === "string" &&
    validStatuses.includes(response.status) &&
    (
      response.failureCode === undefined ||
      typeof response.failureCode === "string"
    )
  );
}

function createIdentityFingerprint(
  identityType: IdentityType,
  identityNumber: string,
): string {
  const secret = process.env.IDENTITY_FINGERPRINT_SECRET;

  if (!secret) {
    throw new IdentityVerificationError(
      "Identity verification is not properly configured.",
      "IDENTITY_CONFIGURATION_ERROR",
    );
  }

  return createHmac("sha256", secret)
    .update(
      `identity-verification:v1:${identityType}:${identityNumber}`,
    )
    .digest("hex");
}

function fingerprintsMatch(
  storedFingerprint: string,
  submittedFingerprint: string,
): boolean {
  if (
    !/^[a-f0-9]{64}$/.test(storedFingerprint) ||
    !/^[a-f0-9]{64}$/.test(submittedFingerprint)
  ) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(storedFingerprint, "hex"),
    Buffer.from(submittedFingerprint, "hex"),
  );
}

function validateIdentityNumber(
  identityType: IdentityType,
  identityNumber: string,
): void {
  if (identityType !== "NIN" && identityType !== "BVN") {
    throw new IdentityVerificationError(
      "Invalid identity type.",
      "INVALID_IDENTITY_TYPE",
    );
  }

  if (!/^\d{11}$/.test(identityNumber)) {
    throw new IdentityVerificationError(
      `${identityType} must contain exactly 11 digits.`,
      "INVALID_IDENTITY_NUMBER",
    );
  }
}

export async function verifyCustomerIdentity(
  userId: string,
  identityType: IdentityType,
  identityNumber: string,
  provider: IdentityVerificationProvider,
  privacyNoticeAcknowledged: boolean,
) {
  validateIdentityNumber(identityType, identityNumber);

  if (!userId || !provider.providerCode) {
    throw new IdentityVerificationError(
      "Invalid identity verification request.",
      "INVALID_REQUEST",
    );
  }

  // Require explicit acknowledgement of the privacy notice.
  if (privacyNoticeAcknowledged !== true) {
    throw new IdentityVerificationError(
      "You must acknowledge the privacy notice before identity verification.",
      "PRIVACY_NOTICE_ACKNOWLEDGEMENT_REQUIRED",
    );
  }

  // Validate the server-controlled compliance configuration.
  const complianceConfig =
    getIdentityVerificationComplianceConfig();

  if (!complianceConfig) {
    throw new IdentityVerificationError(
      "Identity verification compliance configuration is missing or invalid.",
      "IDENTITY_COMPLIANCE_CONFIGURATION_ERROR",
    );
  }

  const fingerprint = createIdentityFingerprint(
    identityType,
    identityNumber,
  );

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      fullName: true,
      email: true,
      phoneNumber: true,
    },
  });

  if (!user) {
    throw new IdentityVerificationError(
      "User not found.",
      "USER_NOT_FOUND",
    );
  }

  // Create or reuse a pending verification record.
  // The advisory lock prevents simultaneous requests from
  // creating separate records for the same customer.
  const verification = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT 1 AS locked
      FROM (
        SELECT pg_advisory_xact_lock(
          hashtext(${userId})::bigint
        )
      ) AS lock_result
    `;

    const existingVerified =
      await tx.identityVerification.findFirst({
        where: {
          userId,
          status: "VERIFIED",
        },
        select: {
          id: true,
        },
      });

    if (existingVerified) {
      throw new IdentityVerificationError(
        "Your identity has already been verified.",
        "IDENTITY_ALREADY_VERIFIED",
      );
    }

    const existingReview =
      await tx.identityVerification.findFirst({
        where: {
          userId,
          identityType,
          status: "REVIEW_REQUIRED",
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });

    if (existingReview) {
      throw new IdentityVerificationError(
        "Your identity verification requires manual review.",
        "IDENTITY_REVIEW_REQUIRED",
      );
    }

    const pending =
      await tx.identityVerification.findFirst({
        where: {
          userId,
          identityType,
          status: "PENDING",
        },
        orderBy: { createdAt: "desc" },
      });

    if (pending) {
      if (pending.providerCode !== provider.providerCode) {
        throw new IdentityVerificationError(
          "A pending verification belongs to another provider.",
          "PROVIDER_MISMATCH",
        );
      }

      if (
        !fingerprintsMatch(
          pending.identityFingerprint,
          fingerprint,
        )
      ) {
        throw new IdentityVerificationError(
          "The identity number does not match the pending verification.",
          "IDENTITY_NUMBER_MISMATCH",
        );
      }

      // A pending record can only be reused if its original
      // compliance details still match the current configuration.
      if (
        pending.privacyNoticeVersion !==
          complianceConfig.privacyNoticeVersion ||
        pending.lawfulBasis !== complianceConfig.lawfulBasis ||
        !pending.noticeAcknowledgedAt
      ) {
        throw new IdentityVerificationError(
          "The pending verification does not match the current compliance requirements.",
          "IDENTITY_COMPLIANCE_MISMATCH",
        );
      }

      return pending;
    }

    const acknowledgedAt = new Date();

    return tx.identityVerification.create({
      data: {
        userId,
        identityType,
        identityFingerprint: fingerprint,

        privacyNoticeVersion:
          complianceConfig.privacyNoticeVersion,

        noticeAcknowledgedAt: acknowledgedAt,

        lawfulBasis: complianceConfig.lawfulBasis,

        consentedAt:
          complianceConfig.lawfulBasis === "CONSENT"
            ? acknowledgedAt
            : null,

        providerCode: provider.providerCode,
        status: "PENDING",
      },
    });
  });

  // Retries reuse the same record ID and idempotency key.
  let providerResult: unknown;

  try {
    providerResult = await provider.verifyIdentity({
      userId: user.id,
      identityType,
      identityNumber,
      fullName: user.fullName,
      email: user.email ?? undefined,
      phoneNumber: user.phoneNumber,
      idempotencyKey: `identity-verification-${verification.id}`,
    });
  } catch {
    // Preserve PENDING when the provider's response is uncertain.
    throw new IdentityVerificationError(
      "Identity verification is temporarily unavailable. Please try again.",
      "IDENTITY_PROVIDER_UNAVAILABLE",
    );
  }

  if (
    !isValidProviderResponse(
      providerResult,
      provider.providerCode,
    )
  ) {
    throw new IdentityVerificationError(
      "The identity provider returned an invalid response.",
      "INVALID_PROVIDER_RESPONSE",
    );
  }

  const updated = await prisma.identityVerification.update({
    where: { id: verification.id },
    data: {
      status: providerResult.status,
      providerReference: providerResult.providerReference,
      verifiedAt:
        providerResult.status === "VERIFIED"
          ? new Date()
          : null,
      failureCode: providerResult.failureCode ?? null,
    },
  });

  return {
    verificationId: updated.id,
    identityType: updated.identityType,
    status: updated.status,
    verifiedAt: updated.verifiedAt,
    message:
      updated.status === "VERIFIED"
        ? "Identity verified successfully."
        : updated.status === "REVIEW_REQUIRED"
          ? "Your identity verification requires further review."
          : "Identity verification failed.",
  };
}
