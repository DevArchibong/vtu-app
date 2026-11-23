
import express from "express";
import request from "supertest";
import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomInt, randomUUID } from "node:crypto";

import { prisma } from "../src/lib/prisma.js";
import { createAccessToken } from "../src/lib/tokens.js";
import { createVirtualAccountRouter } from "../src/routes/virtualAccount.js";
import type {
  VirtualAccountProvider,
  VirtualAccountProviderResult,
} from "../src/providers/virtualAccountProvider.js";

const createdUserIds: string[] = [];

async function createTestCustomer() {
  const customer = await prisma.user.create({
    data: {
      fullName: "Virtual Account Route Test Customer",
      phoneNumber: `+23480${randomInt(10000000, 99999999)}`,
      passwordHash: "test-password-hash",
      wallet: {
        create: {},
      },
    },
    select: {
      id: true,
      wallet: {
        select: {
          id: true,
        },
      },
    },
  });

  createdUserIds.push(customer.id);

  if (!customer.wallet) {
    throw new Error("Test customer wallet was not created.");
  }

  return {
    ...customer,
    wallet: customer.wallet,
  };
}

async function createVerifiedIdentity(userId: string) {
  return prisma.identityVerification.create({
    data: {
      userId,
      identityType: "NIN",
      identityFingerprint: randomUUID().replace(/-/g, "").padEnd(64, "0"),
      providerCode: "mock-kyc-provider",
      providerReference: `mock-ref-${randomUUID()}`,
      status: "VERIFIED",
      verifiedAt: new Date(),
    },
  });
}

function createMockProvider(
  overrides: Partial<VirtualAccountProvider> = {},
) {
  const provider: VirtualAccountProvider = {
    providerCode: "mock-bank-provider",

    createDedicatedAccount: vi.fn(
      async (): Promise<VirtualAccountProviderResult> => ({
        providerCode: "mock-bank-provider",
        providerAccountId: `provider-${randomUUID()}`,
        accountNumber: randomInt(1000000000, 10000000000).toString(),
        bankName: "Mock Bank",
        accountName: "Virtual Account Test Customer",
      }),
    ),

    ...overrides,
  };

  return provider;
}

function createTestApp(provider: VirtualAccountProvider | null) {
  const app = express();

  app.use(express.json());

  app.use(
    "/api/wallet/virtual-account",
    createVirtualAccountRouter(provider),
  );

  return app;
}

function authHeader(userId: string) {
  return {
    Authorization: `Bearer ${createAccessToken(userId, "CUSTOMER")}`,
  };
}

describe("Virtual account routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      const wallets = await prisma.wallet.findMany({
        where: {
          userId: {
            in: createdUserIds,
          },
        },
        select: {
          id: true,
        },
      });

      const walletIds = wallets.map((wallet) => wallet.id);

      if (walletIds.length > 0) {
        await prisma.walletTransaction.deleteMany({
          where: {
            walletId: {
              in: walletIds,
            },
          },
        });

        await prisma.walletFunding.deleteMany({
          where: {
            walletId: {
              in: walletIds,
            },
          },
        });

        await prisma.virtualAccount.deleteMany({
          where: {
            walletId: {
              in: walletIds,
            },
          },
        });
      }

      await prisma.identityVerification.deleteMany({
        where: {
          userId: {
            in: createdUserIds,
          },
        },
      });

      await prisma.wallet.deleteMany({
        where: {
          userId: {
            in: createdUserIds,
          },
        },
      });

      await prisma.user.deleteMany({
        where: {
          id: {
            in: createdUserIds,
          },
        },
      });
    }

    await prisma.$disconnect();
  });

  it("rejects unauthenticated requests", async () => {
    const app = createTestApp(createMockProvider());

    const response = await request(app)
      .post("/api/wallet/virtual-account");

    expect(response.status).toBe(401);
  });

  it("returns 503 when no provider is configured", async () => {
    const customer = await createTestCustomer();
    const app = createTestApp(null);

    const response = await request(app)
      .post("/api/wallet/virtual-account")
      .set(authHeader(customer.id));

    expect(response.status).toBe(503);
    expect(response.body.code).toBe(
      "VIRTUAL_ACCOUNT_PROVIDER_UNAVAILABLE",
    );
  });

  it("rejects customers without verified identity", async () => {
    const customer = await createTestCustomer();
    const provider = createMockProvider();
    const app = createTestApp(provider);

    const response = await request(app)
      .post("/api/wallet/virtual-account")
      .set(authHeader(customer.id));

    expect(response.status).toBe(403);
    expect(response.body.code).toBe(
      "IDENTITY_VERIFICATION_REQUIRED",
    );

    expect(provider.createDedicatedAccount).not.toHaveBeenCalled();
  });

  it("creates a virtual account successfully", async () => {
    const customer = await createTestCustomer();

    await createVerifiedIdentity(customer.id);

    const provider = createMockProvider();
    const app = createTestApp(provider);

    const response = await request(app)
      .post("/api/wallet/virtual-account")
      .set(authHeader(customer.id));

    expect(response.status).toBe(200);
    expect(response.body.virtualAccount).toMatchObject({
      providerCode: "mock-bank-provider",
      accountNumber: expect.any(String),
      bankName: "Mock Bank",
      accountName: "Virtual Account Test Customer",
      status: "ACTIVE",
    });

    expect(provider.createDedicatedAccount).toHaveBeenCalledTimes(1);
  });

  it("reuses an existing active account without another provider request", async () => {
    const customer = await createTestCustomer();

    await createVerifiedIdentity(customer.id);

    const provider = createMockProvider();
    const app = createTestApp(provider);

    const firstResponse = await request(app)
      .post("/api/wallet/virtual-account")
      .set(authHeader(customer.id));

    expect(firstResponse.status).toBe(200);

    const secondResponse = await request(app)
      .post("/api/wallet/virtual-account")
      .set(authHeader(customer.id));

    expect(secondResponse.status).toBe(200);

    expect(secondResponse.body.virtualAccount.id).toBe(
      firstResponse.body.virtualAccount.id,
    );

    expect(provider.createDedicatedAccount).toHaveBeenCalledTimes(1);
  });

  it("returns 202 when the provider outcome is uncertain", async () => {
    const customer = await createTestCustomer();

    await createVerifiedIdentity(customer.id);

    const provider = createMockProvider({
      createDedicatedAccount: vi.fn().mockRejectedValue(
        new Error("Provider request timed out."),
      ),
    });

    const app = createTestApp(provider);

    const response = await request(app)
      .post("/api/wallet/virtual-account")
      .set(authHeader(customer.id));

    expect(response.status).toBe(202);
    expect(response.body.code).toBe(
      "VIRTUAL_ACCOUNT_OUTCOME_UNCERTAIN",
    );

    const savedAccount = await prisma.virtualAccount.findFirst({
      where: {
        walletId: customer.wallet.id,
      },
    });

    expect(savedAccount?.status).toBe("REVIEW_REQUIRED");
  });
});
