
import { prisma } from "../lib/prisma.js";
import type {
  IdentityType,
  IdentityVerificationProvider,
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

function validateIdentityNumber(
  identityType: IdentityType,
  identityNumber: string,
): void {
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
) {
  validateIdentityNumber(identityType, identityNumber);

  if (!identityNumber || !provider.providerCode) {
    throw new IdentityVerificationError(
      "Invalid identity verification request.",
      "INVALID_REQUEST",
    );
  }

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
  // The lock prevents simultaneous requests from creating
  // separate records for the same customer.
  const verification = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(
        hashtext(${userId})::bigint
      )
    `;

    const existingVerified = await tx.identityVerification.findFirst({
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

    const existingReview = await tx.identityVerification.findFirst({
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

    const pending = await tx.identityVerification.findFirst({
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

      return pending;
    }

    return tx.identityVerification.create({
      data: {
        userId,
        identityType,
        providerCode: provider.providerCode,
        status: "PENDING",
      },
    });
  });

  // The record ID gives every attempt a stable idempotency key.
  // Retries of a pending record reuse the same key.
  let providerResult;

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
    // Do not mark an uncertain provider response as failed.
    // A retry can reuse the same pending record and idempotency key.
    throw new IdentityVerificationError(
      "Identity verification is temporarily unavailable. Please try again.",
      "IDENTITY_PROVIDER_UNAVAILABLE",
    );
  }

  if (
    providerResult.providerCode !== provider.providerCode ||
    !providerResult.providerReference
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
