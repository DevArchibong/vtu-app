
import { randomUUID } from "node:crypto";

import { prisma } from "../lib/prisma.js";

import type {
  VerifiedPaymentNotification,
} from "../providers/paymentWebhookProvider.js";

const MAX_DATABASE_INTEGER = 2_147_483_647;

export class WalletFundingError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "WalletFundingError";
  }
}

export type WalletFundingResult =
  | {
      status: "CONFIRMED";
      duplicate: false;
      fundingId: string;
      transactionId: string;
      balanceAfterKobo: number;
    }
  | {
      status: "DUPLICATE";
      duplicate: true;
      fundingId: string;
    }
  | {
      status: "FAILED";
      duplicate: false;
      fundingId: string;
    }
  | {
      status: "REVIEW_REQUIRED";
      duplicate: false;
      fundingId: string;
      reason: string;
    };

function validateNotification(
  notification: VerifiedPaymentNotification,
): void {
  if (
    !notification.providerCode ||
    notification.providerCode.trim() !== notification.providerCode
  ) {
    throw new WalletFundingError(
      "Invalid payment provider code.",
      "INVALID_PROVIDER_CODE",
    );
  }

  if (
    !notification.providerReference ||
    notification.providerReference.trim() !== notification.providerReference
  ) {
    throw new WalletFundingError(
      "Invalid payment reference.",
      "INVALID_PAYMENT_REFERENCE",
    );
  }

  if (
    !notification.providerTransactionId ||
    notification.providerTransactionId.trim() !==
      notification.providerTransactionId
  ) {
    throw new WalletFundingError(
      "Invalid provider transaction ID.",
      "INVALID_PROVIDER_TRANSACTION_ID",
    );
  }

  if (
    !notification.accountNumber ||
    !/^\d{10}$/.test(notification.accountNumber)
  ) {
    throw new WalletFundingError(
      "Invalid virtual account number.",
      "INVALID_ACCOUNT_NUMBER",
    );
  }

  if (
    !Number.isSafeInteger(notification.amountKobo) ||
    notification.amountKobo <= 0 ||
    notification.amountKobo > MAX_DATABASE_INTEGER
  ) {
    throw new WalletFundingError(
      "Invalid payment amount.",
      "INVALID_PAYMENT_AMOUNT",
    );
  }

  if (notification.currency !== "NGN") {
    throw new WalletFundingError(
      "Only NGN payments are accepted.",
      "UNSUPPORTED_CURRENCY",
    );
  }

  if (
    notification.status !== "SUCCESS" &&
    notification.status !== "FAILED"
  ) {
    throw new WalletFundingError(
      "Invalid payment status.",
      "INVALID_PAYMENT_STATUS",
    );
  }
}

async function acquireFundingLocks(
  tx: Parameters<
    Parameters<typeof prisma.$transaction>[0]
  >[0],
  providerCode: string,
  providerReference: string,
  providerTransactionId: string,
): Promise<void> {
  const lockKeys = [
    `funding-reference:${providerCode}:${providerReference}`,
    `funding-transaction:${providerCode}:${providerTransactionId}`,
  ].sort();

  for (const lockKey of lockKeys) {
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(
        hashtext(${lockKey})::bigint
      )
    `;
  }
}

export async function processVerifiedPaymentNotification(
  notification: VerifiedPaymentNotification,
): Promise<WalletFundingResult> {
  validateNotification(notification);

  return prisma.$transaction(async (tx) => {
    await acquireFundingLocks(
      tx,
      notification.providerCode,
      notification.providerReference,
      notification.providerTransactionId,
    );

    const virtualAccount = await tx.virtualAccount.findFirst({
      where: {
        providerCode: notification.providerCode,
        accountNumber: notification.accountNumber,
        status: "ACTIVE",
      },
      select: {
        id: true,
        walletId: true,
      },
    });

    if (!virtualAccount) {
      throw new WalletFundingError(
        "No active virtual account matches this payment.",
        "VIRTUAL_ACCOUNT_NOT_FOUND",
      );
    }

    const existingFunding = await tx.walletFunding.findFirst({
      where: {
        OR: [
          {
            providerReference: notification.providerReference,
          },
          {
            providerCode: notification.providerCode,
            providerTransactionId:
              notification.providerTransactionId,
          },
        ],
      },
    });

    if (existingFunding) {
      if (
        existingFunding.providerCode !== notification.providerCode ||
        existingFunding.providerReference !==
          notification.providerReference ||
        existingFunding.virtualAccountId !== virtualAccount.id
      ) {
        throw new WalletFundingError(
          "Payment identifiers conflict with an existing funding record.",
          "PAYMENT_REFERENCE_CONFLICT",
        );
      }

      if (existingFunding.status === "CONFIRMED") {
        return {
          status: "DUPLICATE",
          duplicate: true,
          fundingId: existingFunding.id,
        };
      }

      if (
        existingFunding.expectedAmountKobo !== null &&
        existingFunding.expectedAmountKobo !==
          notification.amountKobo
      ) {
        const reviewedFunding = await tx.walletFunding.update({
          where: {
            id: existingFunding.id,
          },
          data: {
            receivedAmountKobo: notification.amountKobo,
            status: "REVIEW_REQUIRED",
          },
        });

        return {
          status: "REVIEW_REQUIRED",
          duplicate: false,
          fundingId: reviewedFunding.id,
          reason: "RECEIVED_AMOUNT_DOES_NOT_MATCH_EXPECTED_AMOUNT",
        };
      }

      if (notification.status === "FAILED") {
        const failedFunding = await tx.walletFunding.update({
          where: {
            id: existingFunding.id,
          },
          data: {
            providerTransactionId:
              notification.providerTransactionId,
            receivedAmountKobo: notification.amountKobo,
            status: "FAILED",
          },
        });

        return {
          status: "FAILED",
          duplicate: false,
          fundingId: failedFunding.id,
        };
      }
    }

    if (notification.status === "FAILED") {
      const failedFunding = await tx.walletFunding.create({
        data: {
          walletId: virtualAccount.walletId,
          virtualAccountId: virtualAccount.id,
          providerCode: notification.providerCode,
          providerReference: notification.providerReference,
          providerTransactionId:
            notification.providerTransactionId,
          receivedAmountKobo: notification.amountKobo,
          currency: notification.currency,
          status: "FAILED",
        },
      });

      return {
        status: "FAILED",
        duplicate: false,
        fundingId: failedFunding.id,
      };
    }

    const funding = existingFunding
      ? await tx.walletFunding.update({
          where: {
            id: existingFunding.id,
          },
          data: {
            providerTransactionId:
              notification.providerTransactionId,
            receivedAmountKobo: notification.amountKobo,
            currency: notification.currency,
            status: "CONFIRMED",
            confirmedAt: new Date(),
          },
        })
      : await tx.walletFunding.create({
          data: {
            walletId: virtualAccount.walletId,
            virtualAccountId: virtualAccount.id,
            providerCode: notification.providerCode,
            providerReference: notification.providerReference,
            providerTransactionId:
              notification.providerTransactionId,
            receivedAmountKobo: notification.amountKobo,
            currency: notification.currency,
            status: "CONFIRMED",
            confirmedAt: new Date(),
          },
        });

    // Serialize wallet balance updates to prevent lost updates.
    const walletLockKey = `wallet-balance:${virtualAccount.walletId}`;

    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(
        hashtext(${walletLockKey})::bigint
      )
    `;

    const wallet = await tx.wallet.findUnique({
      where: {
        id: virtualAccount.walletId,
      },
      select: {
        id: true,
        balanceKobo: true,
      },
    });

    if (!wallet) {
      throw new WalletFundingError(
        "Customer wallet was not found.",
        "WALLET_NOT_FOUND",
      );
    }

    const balanceBeforeKobo = wallet.balanceKobo;
    const balanceAfterKobo =
      balanceBeforeKobo + notification.amountKobo;

    if (
      !Number.isSafeInteger(balanceAfterKobo) ||
      balanceAfterKobo > MAX_DATABASE_INTEGER
    ) {
      throw new WalletFundingError(
        "Wallet balance would exceed the supported limit.",
        "WALLET_BALANCE_LIMIT_EXCEEDED",
      );
    }

    await tx.wallet.update({
      where: {
        id: wallet.id,
      },
      data: {
        balanceKobo: balanceAfterKobo,
      },
    });

    const walletTransaction = await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        fundingId: funding.id,
        reference: `WALLET-FUND-${randomUUID()}`,
        type: "CREDIT",
        amountKobo: notification.amountKobo,
        balanceBeforeKobo,
        balanceAfterKobo,
        description: "Wallet funding",
      },
    });

    return {
      status: "CONFIRMED",
      duplicate: false,
      fundingId: funding.id,
      transactionId: walletTransaction.id,
      balanceAfterKobo,
    };
  });
}
