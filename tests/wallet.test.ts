
import {
    afterAll,
    beforeAll,
    describe,
    expect,
    it,
  } from "vitest";
  import request from "supertest";
  import { app } from "../src/app.js";
  import { prisma } from "../src/lib/prisma.js";
  import { createAccessToken } from "../src/lib/tokens.js";
  
  const suffix = Date.now().toString().slice(-8);
  
  let customerA!: {
    id: string;
    wallet: { id: string };
  };
  
  let customerB!: {
    id: string;
    wallet: { id: string };
  };
  
  let customerC!: {
    id: string;
    wallet: { id: string };
  };
  
  const tokenA = () => createAccessToken(customerA.id, "CUSTOMER");
  const tokenB = () => createAccessToken(customerB.id, "CUSTOMER");
  const tokenC = () => createAccessToken(customerC.id, "CUSTOMER");
  
  async function createTestCustomer(phoneNumber: string) {
    return prisma.user.create({
      data: {
        fullName: "Wallet Test Customer",
        phoneNumber,
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
    }).then((user) => {
      if (!user.wallet) {
        throw new Error("Test customer wallet was not created.");
      }
  
      return {
        id: user.id,
        wallet: user.wallet,
      };
    });
  }
  
  describe("Wallet API", () => {
    beforeAll(async () => {
      customerA = await createTestCustomer(`+23480${suffix}`);
      customerB = await createTestCustomer(`+23481${suffix}`);
      customerC = await createTestCustomer(`+23490${suffix}`);
  
      // Give customer A a balance of ₦13.
      await prisma.wallet.update({
        where: { id: customerA.wallet.id },
        data: { balanceKobo: 1300 },
      });
  
      // Create transactions for customer A.
      await prisma.walletTransaction.createMany({
        data: [
          {
            walletId: customerA.wallet.id,
            reference: `WALLET-A-1-${suffix}`,
            type: "CREDIT",
            amountKobo: 1000,
            balanceBeforeKobo: 0,
            balanceAfterKobo: 1000,
            description: "Wallet funding",
            createdAt: new Date("2026-01-01T10:00:00.000Z"),
          },
          {
            walletId: customerA.wallet.id,
            reference: `WALLET-A-2-${suffix}`,
            type: "DEBIT",
            amountKobo: 200,
            balanceBeforeKobo: 1000,
            balanceAfterKobo: 800,
            description: "Data purchase",
            createdAt: new Date("2026-01-02T10:00:00.000Z"),
          },
          {
            walletId: customerA.wallet.id,
            reference: `WALLET-A-3-${suffix}`,
            type: "CREDIT",
            amountKobo: 500,
            balanceBeforeKobo: 800,
            balanceAfterKobo: 1300,
            description: "Wallet funding",
            createdAt: new Date("2026-01-03T10:00:00.000Z"),
          },
        ],
      });
  
      // Create a transaction belonging to customer B.
      await prisma.walletTransaction.create({
        data: {
          walletId: customerB.wallet.id,
          reference: `WALLET-B-1-${suffix}`,
          type: "CREDIT",
          amountKobo: 2000,
          balanceBeforeKobo: 0,
          balanceAfterKobo: 2000,
          description: "Another customer's funding",
        },
      });
    });
  
    afterAll(async () => {
      const walletIds = [
        customerA?.wallet.id,
        customerB?.wallet.id,
        customerC?.wallet.id,
      ].filter((id): id is string => Boolean(id));
  
      const userIds = [
        customerA?.id,
        customerB?.id,
        customerC?.id,
      ].filter((id): id is string => Boolean(id));
  
      if (walletIds.length > 0) {
        await prisma.walletTransaction.deleteMany({
          where: { walletId: { in: walletIds } },
        });
  
        await prisma.wallet.deleteMany({
          where: { id: { in: walletIds } },
        });
      }
  
      if (userIds.length > 0) {
        await prisma.user.deleteMany({
          where: { id: { in: userIds } },
        });
      }
  
      await prisma.$disconnect();
    });
  
    describe("GET /api/wallet", () => {
      it("rejects a request without an access token", async () => {
        const response = await request(app).get("/api/wallet");
  
        expect(response.status).toBe(401);
      });
  
      it("returns the authenticated customer's wallet balance", async () => {
        const response = await request(app)
          .get("/api/wallet")
          .set("Authorization", `Bearer ${tokenA()}`);
  
        expect(response.status).toBe(200);
        expect(response.body.wallet.id).toBe(customerA.wallet.id);
        expect(response.body.wallet.balanceKobo).toBe(1300);
        expect(response.body.wallet.balanceNaira).toBe(13);
        expect(response.body.wallet.currency).toBe("NGN");
      });
  
      it("does not expose another customer's wallet", async () => {
        const response = await request(app)
          .get("/api/wallet")
          .set("Authorization", `Bearer ${tokenB()}`);
  
        expect(response.status).toBe(200);
        expect(response.body.wallet.id).toBe(customerB.wallet.id);
        expect(response.body.wallet.id).not.toBe(customerA.wallet.id);
      });
  
      it("returns 404 when the authenticated user has no wallet", async () => {
        // Use a valid token for a user ID that does not exist.
        const token = createAccessToken("user-without-wallet", "CUSTOMER");
  
        const response = await request(app)
          .get("/api/wallet")
          .set("Authorization", `Bearer ${token}`);
  
        expect(response.status).toBe(404);
        expect(response.body.code).toBe("WALLET_NOT_FOUND");
      });
    });
  
    describe("GET /api/wallet/transactions", () => {
      it("rejects a request without an access token", async () => {
        const response = await request(app)
          .get("/api/wallet/transactions");
  
        expect(response.status).toBe(401);
      });
  
      it("returns only the authenticated customer's transactions", async () => {
        const response = await request(app)
          .get("/api/wallet/transactions")
          .set("Authorization", `Bearer ${tokenA()}`);
  
        expect(response.status).toBe(200);
        expect(response.body.transactions).toHaveLength(3);
        expect(response.body.transactions[0].reference)
          .toBe(`WALLET-A-3-${suffix}`);
  
        expect(
          response.body.transactions.some(
            (transaction: { reference: string }) =>
              transaction.reference === `WALLET-B-1-${suffix}`,
          ),
        ).toBe(false);
      });
  
      it("returns an empty transaction list for a new wallet", async () => {
        const response = await request(app)
          .get("/api/wallet/transactions")
          .set("Authorization", `Bearer ${tokenC()}`);
  
        expect(response.status).toBe(200);
        expect(response.body.transactions).toEqual([]);
        expect(response.body.pagination.total).toBe(0);
      });
  
      it("supports pagination", async () => {
        const response = await request(app)
          .get("/api/wallet/transactions?page=2&limit=1")
          .set("Authorization", `Bearer ${tokenA()}`);
  
        expect(response.status).toBe(200);
        expect(response.body.transactions).toHaveLength(1);
        expect(response.body.pagination).toEqual({
          page: 2,
          limit: 1,
          total: 3,
          totalPages: 3,
        });
      });
  
      it("rejects invalid pagination values", async () => {
        const response = await request(app)
          .get("/api/wallet/transactions?page=0&limit=100")
          .set("Authorization", `Bearer ${tokenA()}`);
  
        expect(response.status).toBe(400);
        expect(response.body.code).toBe("INVALID_PAGINATION");
      });
    });
  });
  