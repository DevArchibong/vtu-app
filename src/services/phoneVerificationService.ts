
import { prisma } from "../lib/prisma.js";
import {
  generateVerificationCode,
  hashVerificationCode,
  verifyCodeHash,
} from "../lib/phoneVerification.js";

const CODE_EXPIRY_MINUTES = 10;
const MAX_VERIFICATION_ATTEMPTS = 5;
const REQUEST_COOLDOWN_SECONDS = 60;

export class PhoneVerificationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "PhoneVerificationError";
  }
}

export async function requestPhoneVerification(userId: string) {
  const code = generateVerificationCode();
  const codeHash = hashVerificationCode(code);

  const result = await prisma.$transaction(async (tx) => {
    // Serialize OTP requests for the same user.
    // The transaction-level lock is automatically released
    // when the transaction commits or rolls back.
    await tx.$queryRaw`
  SELECT 1 AS locked
  FROM (
    SELECT pg_advisory_xact_lock(
      hashtext(${userId})::bigint
    )
  ) AS lock_result
`;
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        phoneVerifiedAt: true,
      },
    });

    if (!user) {
      throw new PhoneVerificationError(
        "User not found.",
        "USER_NOT_FOUND",
      );
    }

    if (user.phoneVerifiedAt) {
      throw new PhoneVerificationError(
        "Phone number is already verified.",
        "PHONE_ALREADY_VERIFIED",
      );
    }

    const now = new Date();

    const cooldownStart = new Date(
      now.getTime() - REQUEST_COOLDOWN_SECONDS * 1000,
    );

    const recentRequest = await tx.phoneVerification.findFirst({
      where: {
        userId,
        createdAt: {
          gt: cooldownStart,
        },
      },
      select: {
        id: true,
      },
    });

    if (recentRequest) {
      throw new PhoneVerificationError(
        "Please wait before requesting another verification code.",
        "REQUEST_COOLDOWN",
      );
    }

    const expiresAt = new Date(
      now.getTime() + CODE_EXPIRY_MINUTES * 60 * 1000,
    );

    // Invalidate previous unused codes before creating a new one.
    await tx.phoneVerification.updateMany({
      where: {
        userId,
        consumedAt: null,
      },
      data: {
        consumedAt: now,
      },
    });

    await tx.phoneVerification.create({
      data: {
        userId,
        codeHash,
        expiresAt,
      },
    });

    return {
      message: "Verification code created.",
      expiresInSeconds: CODE_EXPIRY_MINUTES * 60,
    };
  });

  // Only expose the code during development.
  // A real SMS provider will deliver it to the user's phone.
  if (process.env.NODE_ENV !== "production") {
    return {
      ...result,
      developmentCode: code,
    };
  }

  return {
    message: "Verification code requested.",
    expiresInSeconds: result.expiresInSeconds,
  };
}

export async function confirmPhoneVerification(
  userId: string,
  submittedCode: string,
) {
  if (!/^\d{6}$/.test(submittedCode)) {
    throw new PhoneVerificationError(
      "Verification code must contain exactly six digits.",
      "INVALID_CODE_FORMAT",
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      phoneVerifiedAt: true,
    },
  });

  if (!user) {
    throw new PhoneVerificationError(
      "User not found.",
      "USER_NOT_FOUND",
    );
  }

  if (user.phoneVerifiedAt) {
    throw new PhoneVerificationError(
      "Phone number is already verified.",
      "PHONE_ALREADY_VERIFIED",
    );
  }

  const verification = await prisma.phoneVerification.findFirst({
    where: {
      userId,
      consumedAt: null,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (!verification) {
    throw new PhoneVerificationError(
      "No active verification code was found. Request a new code.",
      "NO_ACTIVE_CODE",
    );
  }

  const now = new Date();

  if (verification.expiresAt <= now) {
    await prisma.phoneVerification.updateMany({
      where: {
        id: verification.id,
        consumedAt: null,
      },
      data: {
        consumedAt: now,
      },
    });

    throw new PhoneVerificationError(
      "Verification code has expired. Request a new code.",
      "CODE_EXPIRED",
    );
  }

  if (verification.attempts >= MAX_VERIFICATION_ATTEMPTS) {
    await prisma.phoneVerification.updateMany({
      where: {
        id: verification.id,
        consumedAt: null,
      },
      data: {
        consumedAt: now,
      },
    });

    throw new PhoneVerificationError(
      "Too many incorrect attempts. Request a new code.",
      "MAX_ATTEMPTS_EXCEEDED",
    );
  }

  const isCorrect = verifyCodeHash(
    submittedCode,
    verification.codeHash,
  );

  if (!isCorrect) {
    const attemptUpdate = await prisma.phoneVerification.updateMany({
      where: {
        id: verification.id,
        consumedAt: null,
        attempts: {
          lt: MAX_VERIFICATION_ATTEMPTS,
        },
        expiresAt: {
          gt: now,
        },
      },
      data: {
        attempts: {
          increment: 1,
        },
      },
    });

    if (attemptUpdate.count === 0) {
      throw new PhoneVerificationError(
        "Verification code is no longer active. Request a new code.",
        "CODE_NO_LONGER_ACTIVE",
      );
    }

    const updatedVerification =
      await prisma.phoneVerification.findUnique({
        where: { id: verification.id },
        select: {
          attempts: true,
        },
      });

    if (
      updatedVerification &&
      updatedVerification.attempts >= MAX_VERIFICATION_ATTEMPTS
    ) {
      await prisma.phoneVerification.updateMany({
        where: {
          id: verification.id,
          consumedAt: null,
        },
        data: {
          consumedAt: new Date(),
        },
      });

      throw new PhoneVerificationError(
        "Too many incorrect attempts. Request a new code.",
        "MAX_ATTEMPTS_EXCEEDED",
      );
    }

    throw new PhoneVerificationError(
      "Incorrect verification code.",
      "INVALID_CODE",
    );
  }

  // Atomically claim the code and verify the user's phone.
  // Only one concurrent confirmation can consume this code.
  await prisma.$transaction(async (tx) => {
    const claimedCode = await tx.phoneVerification.updateMany({
      where: {
        id: verification.id,
        userId,
        consumedAt: null,
        attempts: {
          lt: MAX_VERIFICATION_ATTEMPTS,
        },
        expiresAt: {
          gt: new Date(),
        },
      },
      data: {
        consumedAt: new Date(),
      },
    });

    if (claimedCode.count !== 1) {
      throw new PhoneVerificationError(
        "Verification code is no longer active. Request a new code.",
        "CODE_NO_LONGER_ACTIVE",
      );
    }

    const verifiedUser = await tx.user.updateMany({
      where: {
        id: userId,
        phoneVerifiedAt: null,
      },
      data: {
        phoneVerifiedAt: new Date(),
      },
    });

    if (verifiedUser.count !== 1) {
      throw new PhoneVerificationError(
        "Phone number is already verified.",
        "PHONE_ALREADY_VERIFIED",
      );
    }
  });

  return {
    message: "Phone number verified successfully.",
    verified: true,
  };
}
