
import {
    afterAll,
    describe,
    expect,
    it,
    vi,
  } from "vitest";
  
  import { randomInt, randomUUID } from "node:crypto";
  
  import { prisma } from "../src/lib/prisma.js";
  
  import {
    requestVirtualAccount,
  } from "../src/services/virtualAccountService.js";
  
  import type {
    CreateVirtualAccountInput,
    VirtualAccountProvider,
    VirtualAccountProviderResult,
  } from "../src/providers/virtualAccountProvider.js";
  
  const providerCode = "TEST_VIRTUAL_ACCOUNT_PROVIDER";
  
  const usersToCleanUp: string[] = [];
  
  function createTestAccountNumber(): string {
    return randomInt(1_000_000_000, 10_000_000_000).toString();
  }
  
  function createProvider(
    implementation?: (
      input: CreateVirtualAccountInput,
    ) => Promise<VirtualAccountProviderResult>,
  ): VirtualAccountProvider {
    return {
      providerCode,
  
      createDedicatedAccount: vi.fn(
        implementation ??
          (async () => ({
            providerCode,
            providerAccountId: `provider-${randomUUID()}`,
            accountNumber: createTestAccountNumber(),
            bankName: "Test Bank",
            accountName: "Test Customer",
          })),
      ),
    };
  }
  
  async function createCustomer(verified = true) {
    const user = await prisma.user.create({
      data: {
        fullName: "Virtual Account Test Customer",
        phoneNumber: `+23480${randomUUID().replace(/\D/g, "").slice(0, 8)}`,
        email: `${randomUUID()}@example.com`,
        passwordHash: "test-password-hash",
      },
    });
  
    usersToCleanUp.push(user.id);
  
    if (verified) {
      await prisma.identityVerification.create({
        data: {
          userId: user.id,
          identityType: "NIN",
          identityFingerprint: randomUUID().replace(/-/g, ""),
          providerCode: "TEST_IDENTITY_PROVIDER",
          status: "VERIFIED",
          verifiedAt: new Date(),
        },
      });
    }
  
    return user;
  }
  
  async function createWallet(userId: string) {
    return prisma.wallet.create({
      data: { userId },
    });
  }
  
  async function createExistingVirtualAccount(
    walletId: string,
    status: "ACTIVE" | "PENDING" | "REVIEW_REQUIRED",
  ) {
    return prisma.virtualAccount.create({
      data: {
        walletId,
        providerCode,
        idempotencyKey: `test-${randomUUID()}`,
        status,
        ...(status === "ACTIVE"
          ? {
              providerAccountId: `existing-${randomUUID()}`,
              accountNumber: createTestAccountNumber(),
              bankName: "Test Bank",
              accountName: "Existing Customer",
            }
          : {}),
      },
    });
  }
  
  afterAll(async () => {
    if (usersToCleanUp.length > 0) {
      const wallets = await prisma.wallet.findMany({
        where: {
          userId: { in: usersToCleanUp },
        },
        select: { id: true },
      });
  
      const walletIds = wallets.map((wallet) => wallet.id);
  
      if (walletIds.length > 0) {
        await prisma.walletTransaction.deleteMany({
          where: { walletId: { in: walletIds } },
        });
  
        await prisma.walletFunding.deleteMany({
          where: { walletId: { in: walletIds } },
        });
  
        await prisma.virtualAccount.deleteMany({
          where: { walletId: { in: walletIds } },
        });
      }
  
      await prisma.identityVerification.deleteMany({
        where: { userId: { in: usersToCleanUp } },
      });
  
      await prisma.wallet.deleteMany({
        where: { userId: { in: usersToCleanUp } },
      });
  
      await prisma.user.deleteMany({
        where: { id: { in: usersToCleanUp } },
      });
    }
  
    await prisma.$disconnect();
  });
  
  describe("Virtual account service", () => {
    it("rejects customers without verified NIN or BVN", async () => {
      const user = await createCustomer(false);
      const provider = createProvider();
  
      await expect(
        requestVirtualAccount(user.id, provider),
      ).rejects.toMatchObject({
        code: "IDENTITY_VERIFICATION_REQUIRED",
      });
  
      expect(provider.createDedicatedAccount).not.toHaveBeenCalled();
  
      const wallet = await prisma.wallet.findUnique({
        where: { userId: user.id },
      });
  
      expect(wallet).toBeNull();
    });
  
    it("creates and activates a virtual account successfully", async () => {
      const user = await createCustomer();
      const provider = createProvider();
  
      const account = await requestVirtualAccount(
        user.id,
        provider,
      );
  
      expect(account.status).toBe("ACTIVE");
      expect(account.providerCode).toBe(providerCode);
      expect(account.providerAccountId).toBeTruthy();
      expect(account.accountNumber).toBeTruthy();
      expect(account.bankName).toBe("Test Bank");
  
      expect(provider.createDedicatedAccount).toHaveBeenCalledTimes(1);
  
      const providerInput = vi.mocked(
        provider.createDedicatedAccount,
      ).mock.calls[0][0];
  
      expect(providerInput.userId).toBe(user.id);
      expect(providerInput.idempotencyKey).toBe(account.idempotencyKey);
    });
  
    it("returns an existing active account without another provider request", async () => {
      const user = await createCustomer();
      const wallet = await createWallet(user.id);
  
      const existingAccount = await createExistingVirtualAccount(
        wallet.id,
        "ACTIVE",
      );
  
      const provider = createProvider();
  
      const account = await requestVirtualAccount(
        user.id,
        provider,
      );
  
      expect(account.id).toBe(existingAccount.id);
      expect(account.status).toBe("ACTIVE");
      expect(provider.createDedicatedAccount).not.toHaveBeenCalled();
    });
  
    it.each(["PENDING", "REVIEW_REQUIRED"] as const)(
      "does not resubmit an account request already in %s status",
      async (status) => {
        const user = await createCustomer();
        const wallet = await createWallet(user.id);
  
        const existingAccount = await createExistingVirtualAccount(
          wallet.id,
          status,
        );
  
        const provider = createProvider();
  
        const account = await requestVirtualAccount(
          user.id,
          provider,
        );
  
        expect(account.id).toBe(existingAccount.id);
        expect(account.status).toBe(status);
  
        expect(
          provider.createDedicatedAccount,
        ).not.toHaveBeenCalled();
      },
    );
  
    it("marks uncertain provider outcomes as REVIEW_REQUIRED", async () => {
      const user = await createCustomer();
  
      const provider = createProvider(async () => {
        throw new Error("Provider connection timed out");
      });
  
      await expect(
        requestVirtualAccount(user.id, provider),
      ).rejects.toMatchObject({
        code: "VIRTUAL_ACCOUNT_OUTCOME_UNCERTAIN",
      });
  
      const wallet = await prisma.wallet.findUniqueOrThrow({
        where: { userId: user.id },
      });
  
      const account = await prisma.virtualAccount.findFirstOrThrow({
        where: { walletId: wallet.id },
      });
  
      expect(account.status).toBe("REVIEW_REQUIRED");
      expect(provider.createDedicatedAccount).toHaveBeenCalledTimes(1);
    });
  
    it("marks invalid provider responses as REVIEW_REQUIRED", async () => {
      const user = await createCustomer();
  
      const provider = createProvider(async () => {
        return {
          providerCode: "WRONG_PROVIDER",
          providerAccountId: "",
          accountNumber: "",
          bankName: "",
          accountName: "",
        };
      });
  
      await expect(
        requestVirtualAccount(user.id, provider),
      ).rejects.toMatchObject({
        code: "INVALID_PROVIDER_RESPONSE",
      });
  
      const wallet = await prisma.wallet.findUniqueOrThrow({
        where: { userId: user.id },
      });
  
      const account = await prisma.virtualAccount.findFirstOrThrow({
        where: { walletId: wallet.id },
      });
  
      expect(account.status).toBe("REVIEW_REQUIRED");
    });
  
    it("prevents concurrent requests from creating duplicate provider accounts", async () => {
      const user = await createCustomer();
  
      let resolveProvider!: (
        result: VirtualAccountProviderResult,
      ) => void;
  
      const providerResponse = new Promise<VirtualAccountProviderResult>(
        (resolve) => {
          resolveProvider = resolve;
        },
      );
  
      const provider = createProvider(
        async () => providerResponse,
      );
  
      const firstRequest = requestVirtualAccount(
        user.id,
        provider,
      );
  
      await vi.waitFor(() => {
        expect(
          provider.createDedicatedAccount,
        ).toHaveBeenCalledTimes(1);
      });
  
      const secondRequest = await requestVirtualAccount(
        user.id,
        provider,
      );
  
      expect(secondRequest.status).toBe("PENDING");
  
      resolveProvider({
        providerCode,
        providerAccountId: `concurrent-${randomUUID()}`,
        accountNumber: createTestAccountNumber(),
        bankName: "Test Bank",
        accountName: "Concurrent Test Customer",
      });
  
      const firstResult = await firstRequest;
  
      expect(firstResult.status).toBe("ACTIVE");
      expect(provider.createDedicatedAccount).toHaveBeenCalledTimes(1);
  
      const wallet = await prisma.wallet.findUniqueOrThrow({
        where: { userId: user.id },
      });
  
      const accounts = await prisma.virtualAccount.findMany({
        where: {
          walletId: wallet.id,
          providerCode,
        },
      });
  
      expect(accounts).toHaveLength(1);
    });
  });
  