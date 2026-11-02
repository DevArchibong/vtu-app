-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "WalletFundingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "VirtualAccountStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balanceKobo" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VirtualAccount" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "providerCode" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "status" "VirtualAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VirtualAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletFunding" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "virtualAccountId" TEXT NOT NULL,
    "providerCode" TEXT NOT NULL,
    "providerReference" TEXT NOT NULL,
    "providerTransactionId" TEXT,
    "expectedAmountKobo" INTEGER,
    "receivedAmountKobo" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'NGN',
    "status" "WalletFundingStatus" NOT NULL DEFAULT 'PENDING',
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletFunding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "fundingId" TEXT,
    "reference" TEXT NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "amountKobo" INTEGER NOT NULL,
    "balanceBeforeKobo" INTEGER NOT NULL,
    "balanceAfterKobo" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_userId_key" ON "Wallet"("userId");

-- CreateIndex
CREATE INDEX "VirtualAccount_walletId_status_idx" ON "VirtualAccount"("walletId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "VirtualAccount_providerCode_providerAccountId_key" ON "VirtualAccount"("providerCode", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "VirtualAccount_providerCode_accountNumber_key" ON "VirtualAccount"("providerCode", "accountNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WalletFunding_providerReference_key" ON "WalletFunding"("providerReference");

-- CreateIndex
CREATE INDEX "WalletFunding_walletId_status_idx" ON "WalletFunding"("walletId", "status");

-- CreateIndex
CREATE INDEX "WalletFunding_createdAt_idx" ON "WalletFunding"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WalletFunding_providerCode_providerTransactionId_key" ON "WalletFunding"("providerCode", "providerTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_fundingId_key" ON "WalletTransaction"("fundingId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_reference_key" ON "WalletTransaction"("reference");

-- CreateIndex
CREATE INDEX "WalletTransaction_walletId_createdAt_idx" ON "WalletTransaction"("walletId", "createdAt");

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VirtualAccount" ADD CONSTRAINT "VirtualAccount_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletFunding" ADD CONSTRAINT "WalletFunding_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletFunding" ADD CONSTRAINT "WalletFunding_virtualAccountId_fkey" FOREIGN KEY ("virtualAccountId") REFERENCES "VirtualAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_fundingId_fkey" FOREIGN KEY ("fundingId") REFERENCES "WalletFunding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
