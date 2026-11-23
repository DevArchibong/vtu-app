
import { randomUUID } from "node:crypto";

import { prisma } from "../lib/prisma.js";

import type {
  VirtualAccountProvider,
  VirtualAccountProviderResult,
} from "../providers/virtualAccountProvider.js";

export class VirtualAccountError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "VirtualAccountError";
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidProviderResult(
  value: unknown,
  expectedProviderCode: string,
): value is VirtualAccountProviderResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const result = value as Record<string, unknown>;

  return (
    result.providerCode === expectedProviderCode &&
    isNonEmptyString(result.providerAccountId) &&
    isNonEmptyString(result.accountNumber) &&
    isNonEmptyString(result.bankName) &&
    isNonEmptyString(result.accountName)
  );
}

export async function requestVirtualAccount(
  userId: string,
  provider: VirtualAccountProvider,
) {
  if (!isNonEmptyString(userId)) {
    throw new VirtualAccountError(
      "A valid user ID is required.",
      "INVALID_USER_ID",
    );
  }

  const providerCode = provider.providerCode?.trim();

  if (!isNonEmptyString(providerCode)) {
    throw new VirtualAccountError(
      "The virtual account provider is not configured correctly.",
      "INVALID_PROVIDER_CONFIGURATION",
    );
  }

  /*
   * Prepare the request inside a database transaction.
   *
   * The advisory lock prevents concurrent requests for the
   * same customer and provider from creating duplicate records.
   */
  const preparation = await prisma.$transaction(async (tx) => {
    const lockKey = `${userId}:${providerCode}`;

    await tx.$queryRaw`
      SELECT 1 AS locked
      FROM (
        SELECT pg_advisory_xact_lock(
          hashtext(${lockKey})::bigint
        )
      ) AS lock_result
    `;

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        phoneNumber: true,
      },
    });

    if (!user) {
      throw new VirtualAccountError(
        "Customer account was not found.",
        "USER_NOT_FOUND",
      );
    }

    const verifiedIdentity =
      await tx.identityVerification.findFirst({
        where: {
          userId,
          status: "VERIFIED",
          verifiedAt: { not: null },
        },
        select: { id: true },
      });

    if (!verifiedIdentity) {
      throw new VirtualAccountError(
        "Complete NIN or BVN identity verification before creating a virtual account.",
        "IDENTITY_VERIFICATION_REQUIRED",
      );
    }

    const wallet = await tx.wallet.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { id: true },
    });

    /*
     * An active account is returned rather than creating another.
     */
    const activeAccount = await tx.virtualAccount.findFirst({
      where: {
        walletId: wallet.id,
        providerCode,
        status: "ACTIVE",
      },
    });

    if (activeAccount) {
      return {
        kind: "EXISTING" as const,
        account: activeAccount,
      };
    }

    /*
     * Pending and review-required records represent unresolved
     * requests. Never automatically submit another provider request.
     */
    const unresolvedAccount = await tx.virtualAccount.findFirst({
      where: {
        walletId: wallet.id,
        providerCode,
        status: {
          in: ["PENDING", "REVIEW_REQUIRED"],
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (unresolvedAccount) {
      return {
        kind: "EXISTING" as const,
        account: unresolvedAccount,
      };
    }

    /*
     * Save the local record before contacting the external provider.
     */
    const account = await tx.virtualAccount.create({
      data: {
        walletId: wallet.id,
        providerCode,
        idempotencyKey: `virtual-account-${randomUUID()}`,
        status: "PENDING",
      },
    });

    return {
      kind: "NEW" as const,
      account,
      user,
    };
  });

  /*
   * Existing accounts are returned without another provider call.
   */
  if (preparation.kind === "EXISTING") {
    return preparation.account;
  }

  const { account, user } = preparation;

  let providerResult: unknown;

  try {
    providerResult = await provider.createDedicatedAccount({
      userId: user.id,
      fullName: user.fullName,
      ...(user.email ? { email: user.email } : {}),
      phoneNumber: user.phoneNumber,
      idempotencyKey: account.idempotencyKey,
    });
  } catch {
    /*
     * A provider exception does not prove that account creation failed.
     * The provider may have created the account before the connection
     * failed. Preserve the record for reconciliation.
     */
    await prisma.virtualAccount.update({
      where: { id: account.id },
      data: { status: "REVIEW_REQUIRED" },
    });

    throw new VirtualAccountError(
      "The provider outcome is uncertain. The request has been saved for reconciliation.",
      "VIRTUAL_ACCOUNT_OUTCOME_UNCERTAIN",
    );
  }

  if (!isValidProviderResult(providerResult, providerCode)) {
    await prisma.virtualAccount.update({
      where: { id: account.id },
      data: { status: "REVIEW_REQUIRED" },
    });

    throw new VirtualAccountError(
      "The provider returned an invalid or unexpected account response. Manual reconciliation is required.",
      "INVALID_PROVIDER_RESPONSE",
    );
  }

  /*
   * Only a validated provider response can activate the account.
   */
  return prisma.virtualAccount.update({
    where: { id: account.id },
    data: {
      providerAccountId: providerResult.providerAccountId.trim(),
      accountNumber: providerResult.accountNumber.trim(),
      bankName: providerResult.bankName.trim(),
      accountName: providerResult.accountName.trim(),
      status: "ACTIVE",
    },
  });
}
