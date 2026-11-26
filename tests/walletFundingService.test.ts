
import { randomInt } from "node:crypto";
import {
  afterAll,
  describe,
  expect,
  it,
} from "vitest";

import { prisma } from "../src/lib/prisma.js";
import {
  processVerifiedPaymentNotification,
  WalletFundingError,
} from "../src/services/walletFundingService.js";

import type {
  VerifiedPaymentNotification,
} from "../src/providers/paymentWebhookProvider.js";

const createdUserIds: string[] = [];
const createdWalletIds: string[] = [];

const PROVIDER_CODE = "TEST_PROVIDER";

async function createTestCustomer(initialBalanceKobo = 1_000) {
  const suffix = randomInt(1_000_000, 9_999_999).toString();

  const user = await prisma.user.create({
    data: {
      fullName: `Funding Test ${suffix}`,
      phoneNumber: `+23480${suffix}`,
      passwordHash: "test-password-hash",
    },
  });

  createdUserIds.push(user.id);

  const wallet = await prisma.wallet.create({
    data: {
      userId: user.id,
      balanceKobo: initialBalanceKobo,
    },
  });

  createdWalletIds.push(wallet.id);

  const accountNumber = randomInt(
    1_000_000_000,
    10_000_000_000,
  ).toString();

  const virtualAccount = await prisma.virtualAccount.create({
    data: {
      walletId: wallet.id,
      providerCode: PROVIDER_CODE,
      idempotencyKey: `test-${suffix}`,
      providerAccountId: `provider-${suffix}`,
      accountNumber,
      bankName: "Test Bank",
      accountName: user.fullName,
      status: "ACTIVE",
    },
  });

  return {
    user,
    wallet,
    virtualAccount,
    accountNumber,
  };
}

function createNotification(
  accountNumber: string,
  overrides: Partial<VerifiedPaymentNotification> = {},
): VerifiedPaymentNotification {
  return {
    providerCode: PROVIDER_CODE,
    providerReference: `reference-${crypto.randomUUID()}`,
    providerTransactionId: `transaction-${crypto.randomUUID()}`,
    accountNumber,
    amountKobo: 5_000,
    currency: "NGN",
    status: "SUCCESS",
    ...overrides,
  };
}

async function createPendingFunding(
  walletId: string,
  virtualAccountId: string,
  expectedAmountKobo: number,
) {
  return prisma.walletFunding.create({
    data: {
      walletId,
      virtualAccountId,
      providerCode: PROVIDER_CODE,
      providerReference: `pending-${crypto.randomUUID()}`,
      expectedAmountKobo,
      status: "PENDING",
    },
  });
}

afterAll(async () => {
  if (createdWalletIds.length > 0) {
    await prisma.walletTransaction.deleteMany({
      where: {
        walletId: { in: createdWalletIds },
      },
    });

    await prisma.walletFunding.deleteMany({
      where: {
        walletId: { in: createdWalletIds },
      },
    });

    await prisma.virtualAccount.deleteMany({
      where: {
        walletId: { in: createdWalletIds },
      },
    });

    await prisma.wallet.deleteMany({
      where: {
        id: { in: createdWalletIds },
      },
    });
  }

  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({
      where: {
        id: { in: createdUserIds },
      },
    });
  }

  await prisma.$disconnect();
});

describe("Wallet funding service", () => {
  it("credits the wallet and creates a ledger transaction", async () => {
    const customer = await createTestCustomer(1_000);
    const notification = createNotification(
      customer.accountNumber,
    );

    const result =
      await processVerifiedPaymentNotification(notification);

    expect(result.status).toBe("CONFIRMED");

    if (result.status !== "CONFIRMED") {
      throw new Error("Expected funding to be confirmed");
    }

    expect(result.duplicate).toBe(false);
    expect(result.balanceAfterKobo).toBe(6_000);

    const wallet = await prisma.wallet.findUnique({
      where: { id: customer.wallet.id },
    });

    expect(wallet?.balanceKobo).toBe(6_000);

    const funding = await prisma.walletFunding.findUnique({
      where: {
        providerReference: notification.providerReference,
      },
    });

    expect(funding?.status).toBe("CONFIRMED");
    expect(funding?.receivedAmountKobo).toBe(5_000);

    const transaction =
      await prisma.walletTransaction.findUnique({
        where: {
          fundingId: funding?.id,
        },
      });

    expect(transaction).not.toBeNull();
    expect(transaction?.type).toBe("CREDIT");
    expect(transaction?.amountKobo).toBe(5_000);
    expect(transaction?.balanceBeforeKobo).toBe(1_000);
    expect(transaction?.balanceAfterKobo).toBe(6_000);
  });

  it("does not credit the wallet twice for a duplicate notification", async () => {
    const customer = await createTestCustomer(2_000);
    const notification = createNotification(
      customer.accountNumber,
    );

    const firstResult =
      await processVerifiedPaymentNotification(notification);

    const secondResult =
      await processVerifiedPaymentNotification(notification);

    expect(firstResult.status).toBe("CONFIRMED");
    expect(secondResult.status).toBe("DUPLICATE");

    const wallet = await prisma.wallet.findUnique({
      where: { id: customer.wallet.id },
    });

    expect(wallet?.balanceKobo).toBe(7_000);

    const transactions =
      await prisma.walletTransaction.count({
        where: {
          walletId: customer.wallet.id,
        },
      });

    expect(transactions).toBe(1);
  });

  it("prevents duplicate credits when notifications arrive concurrently", async () => {
    const customer = await createTestCustomer(3_000);
    const notification = createNotification(
      customer.accountNumber,
    );

    const results = await Promise.all([
      processVerifiedPaymentNotification(notification),
      processVerifiedPaymentNotification(notification),
    ]);

    expect(
      results.filter((result) => result.status === "CONFIRMED"),
    ).toHaveLength(1);

    expect(
      results.filter((result) => result.status === "DUPLICATE"),
    ).toHaveLength(1);

    const wallet = await prisma.wallet.findUnique({
      where: { id: customer.wallet.id },
    });

    expect(wallet?.balanceKobo).toBe(8_000);

    const transactions =
      await prisma.walletTransaction.count({
        where: {
          walletId: customer.wallet.id,
        },
      });

    expect(transactions).toBe(1);
  });

  it("records failed payments without crediting the wallet", async () => {
    const customer = await createTestCustomer(4_000);

    const notification = createNotification(
      customer.accountNumber,
      { status: "FAILED" },
    );

    const result =
      await processVerifiedPaymentNotification(notification);

    expect(result.status).toBe("FAILED");

    const wallet = await prisma.wallet.findUnique({
      where: { id: customer.wallet.id },
    });

    expect(wallet?.balanceKobo).toBe(4_000);

    const funding = await prisma.walletFunding.findUnique({
      where: {
        providerReference: notification.providerReference,
      },
    });

    expect(funding?.status).toBe("FAILED");

    const transactions =
      await prisma.walletTransaction.count({
        where: {
          walletId: customer.wallet.id,
        },
      });

    expect(transactions).toBe(0);
  });

  it("rejects notifications with an unsupported currency", async () => {
    const customer = await createTestCustomer();

    const notification = createNotification(
      customer.accountNumber,
      { currency: "USD" },
    );

    await expect(
      processVerifiedPaymentNotification(notification),
    ).rejects.toBeInstanceOf(WalletFundingError);
  });

  it("rejects invalid payment amounts", async () => {
    const customer = await createTestCustomer();

    const notification = createNotification(
      customer.accountNumber,
      { amountKobo: 0 },
    );

    await expect(
      processVerifiedPaymentNotification(notification),
    ).rejects.toBeInstanceOf(WalletFundingError);
  });

  it("rejects notifications for unknown virtual accounts", async () => {
    const notification = createNotification(
      "1234567890",
    );

    await expect(
      processVerifiedPaymentNotification(notification),
    ).rejects.toMatchObject({
      code: "VIRTUAL_ACCOUNT_NOT_FOUND",
    });
  });

  it("flags payments with an amount different from the expected amount", async () => {
    const customer = await createTestCustomer(1_000);

    const pendingFunding = await createPendingFunding(
      customer.wallet.id,
      customer.virtualAccount.id,
      5_000,
    );

    const notification = createNotification(
      customer.accountNumber,
      {
        providerReference: pendingFunding.providerReference,
        amountKobo: 4_000,
      },
    );

    const result =
      await processVerifiedPaymentNotification(notification);

    expect(result.status).toBe("REVIEW_REQUIRED");

    const updatedFunding =
      await prisma.walletFunding.findUnique({
        where: {
          id: pendingFunding.id,
        },
      });

    expect(updatedFunding?.status).toBe("REVIEW_REQUIRED");
    expect(updatedFunding?.receivedAmountKobo).toBe(4_000);

    const wallet = await prisma.wallet.findUnique({
      where: { id: customer.wallet.id },
    });

    expect(wallet?.balanceKobo).toBe(1_000);
  });

  it("rejects a provider transaction reference already associated with another payment", async () => {
    const firstCustomer = await createTestCustomer();
    const secondCustomer = await createTestCustomer();

    const existingNotification = createNotification(
      firstCustomer.accountNumber,
    );

    await processVerifiedPaymentNotification(
      existingNotification,
    );

    const conflictingNotification = createNotification(
      secondCustomer.accountNumber,
      {
        providerReference: `different-${crypto.randomUUID()}`,
        providerTransactionId:
          existingNotification.providerTransactionId,
      },
    );

    await expect(
      processVerifiedPaymentNotification(
        conflictingNotification,
      ),
    ).rejects.toMatchObject({
      code: "PAYMENT_REFERENCE_CONFLICT",
    });

    const secondWallet = await prisma.wallet.findUnique({
      where: { id: secondCustomer.wallet.id },
    });

    expect(secondWallet?.balanceKobo).toBe(1_000);
  });
});

it("recognises a confirmed payment even after its virtual account becomes inactive", async () => {
    const customer = await createTestCustomer(2_000);
    const notification = createNotification(customer.accountNumber);

    const firstResult =
      await processVerifiedPaymentNotification(notification);

    expect(firstResult.status).toBe("CONFIRMED");

    await prisma.virtualAccount.update({
      where: { id: customer.virtualAccount.id },
      data: { status: "INACTIVE" },
    });

    const secondResult =
      await processVerifiedPaymentNotification(notification);

    expect(secondResult.status).toBe("DUPLICATE");

    const wallet = await prisma.wallet.findUnique({
      where: { id: customer.wallet.id },
    });

    expect(wallet?.balanceKobo).toBe(7_000);

    const transactions = await prisma.walletTransaction.count({
      where: { walletId: customer.wallet.id },
    });

    expect(transactions).toBe(1);
  });

  it("requires reconciliation when a failed payment later receives a success notification", async () => {
    const customer = await createTestCustomer(3_000);

    const failedNotification = createNotification(
      customer.accountNumber,
      { status: "FAILED" },
    );

    const failedResult =
      await processVerifiedPaymentNotification(failedNotification);

    expect(failedResult.status).toBe("FAILED");

    const successNotification = {
      ...failedNotification,
      status: "SUCCESS" as const,
    };

    const successResult =
      await processVerifiedPaymentNotification(successNotification);

    expect(successResult.status).toBe("REVIEW_REQUIRED");

    const funding = await prisma.walletFunding.findUnique({
      where: {
        providerReference: failedNotification.providerReference,
      },
    });

    expect(funding?.status).toBe("REVIEW_REQUIRED");

    const wallet = await prisma.wallet.findUnique({
      where: { id: customer.wallet.id },
    });

    expect(wallet?.balanceKobo).toBe(3_000);

    const transactions = await prisma.walletTransaction.count({
      where: { walletId: customer.wallet.id },
    });

    expect(transactions).toBe(0);
  });

  it("does not automatically credit a payment already requiring reconciliation", async () => {
    const customer = await createTestCustomer(4_000);

    const pendingFunding = await createPendingFunding(
      customer.wallet.id,
      customer.virtualAccount.id,
      5_000,
    );

    const notification = createNotification(
      customer.accountNumber,
      {
        providerReference: pendingFunding.providerReference,
        amountKobo: 4_000,
      },
    );

    const firstResult =
      await processVerifiedPaymentNotification(notification);

    expect(firstResult.status).toBe("REVIEW_REQUIRED");

    const successNotification = {
      ...notification,
      amountKobo: 5_000,
      status: "SUCCESS" as const,
    };

    const secondResult =
      await processVerifiedPaymentNotification(successNotification);

    expect(secondResult.status).toBe("REVIEW_REQUIRED");

    const funding = await prisma.walletFunding.findUnique({
      where: { id: pendingFunding.id },
    });

    expect(funding?.status).toBe("REVIEW_REQUIRED");

    const wallet = await prisma.wallet.findUnique({
      where: { id: customer.wallet.id },
    });

    expect(wallet?.balanceKobo).toBe(4_000);

    const transactions = await prisma.walletTransaction.count({
      where: { walletId: customer.wallet.id },
    });

    expect(transactions).toBe(0);
  });
