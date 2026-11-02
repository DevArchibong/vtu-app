
import { Router } from "express";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/authenticate.js";
import { prisma } from "../lib/prisma.js";

export const walletRouter = Router();

// GET /api/wallet
// Returns the authenticated customer's wallet balance.
walletRouter.get(
  "/wallet",
  authenticate,
  async (req: AuthenticatedRequest, res) => {
    const wallet = await prisma.wallet.findUnique({
      where: {
        userId: req.user!.id,
      },
      select: {
        id: true,
        balanceKobo: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!wallet) {
      res.status(404).json({
        error: "Wallet not found.",
        code: "WALLET_NOT_FOUND",
      });
      return;
    }

    res.status(200).json({
      wallet: {
        id: wallet.id,
        balanceKobo: wallet.balanceKobo,
        balanceNaira: wallet.balanceKobo / 100,
        currency: "NGN",
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt,
      },
    });
  },
);

// GET /api/wallet/transactions
// Returns the authenticated customer's wallet transactions.
walletRouter.get(
  "/wallet/transactions",
  authenticate,
  async (req: AuthenticatedRequest, res) => {
    const pageValue = req.query.page;
    const limitValue = req.query.limit;

    const pageString =
      typeof pageValue === "string" ? pageValue : "1";

    const limitString =
      typeof limitValue === "string" ? limitValue : "20";

    if (
      !/^[1-9]\d*$/.test(pageString) ||
      !/^[1-9]\d*$/.test(limitString)
    ) {
      res.status(400).json({
        error: "Page and limit must be positive whole numbers.",
        code: "INVALID_PAGINATION",
      });
      return;
    }

    const page = Number(pageString);
    const limit = Number(limitString);

    if (
      !Number.isSafeInteger(page) ||
      !Number.isSafeInteger(limit) ||
      limit > 50
    ) {
      res.status(400).json({
        error: "Invalid pagination values. Limit cannot exceed 50.",
        code: "INVALID_PAGINATION",
      });
      return;
    }

    const wallet = await prisma.wallet.findUnique({
      where: {
        userId: req.user!.id,
      },
      select: {
        id: true,
      },
    });

    if (!wallet) {
      res.status(404).json({
        error: "Wallet not found.",
        code: "WALLET_NOT_FOUND",
      });
      return;
    }

    const skip = (page - 1) * limit;

    if (!Number.isSafeInteger(skip)) {
      res.status(400).json({
        error: "Requested page is too large.",
        code: "INVALID_PAGINATION",
      });
      return;
    }

    const [transactions, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where: {
          walletId: wallet.id,
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
        select: {
          id: true,
          reference: true,
          type: true,
          amountKobo: true,
          balanceBeforeKobo: true,
          balanceAfterKobo: true,
          description: true,
          createdAt: true,
        },
      }),

      prisma.walletTransaction.count({
        where: {
          walletId: wallet.id,
        },
      }),
    ]);

    res.status(200).json({
      transactions: transactions.map((transaction) => ({
        id: transaction.id,
        reference: transaction.reference,
        type: transaction.type,
        amountKobo: transaction.amountKobo,
        amountNaira: transaction.amountKobo / 100,
        balanceBeforeKobo: transaction.balanceBeforeKobo,
        balanceBeforeNaira: transaction.balanceBeforeKobo / 100,
        balanceAfterKobo: transaction.balanceAfterKobo,
        balanceAfterNaira: transaction.balanceAfterKobo / 100,
        description: transaction.description,
        createdAt: transaction.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  },
);
