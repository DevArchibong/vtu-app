/*
  Warnings:

  - A unique constraint covering the columns `[idempotencyKey]` on the table `VirtualAccount` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `idempotencyKey` to the `VirtualAccount` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "VirtualAccountStatus" ADD VALUE 'PENDING';
ALTER TYPE "VirtualAccountStatus" ADD VALUE 'FAILED';
ALTER TYPE "VirtualAccountStatus" ADD VALUE 'REVIEW_REQUIRED';

-- AlterTable
ALTER TABLE "VirtualAccount" ADD COLUMN     "idempotencyKey" TEXT NOT NULL,
ALTER COLUMN "providerAccountId" DROP NOT NULL,
ALTER COLUMN "accountNumber" DROP NOT NULL,
ALTER COLUMN "bankName" DROP NOT NULL,
ALTER COLUMN "accountName" DROP NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- CreateIndex
CREATE UNIQUE INDEX "VirtualAccount_idempotencyKey_key" ON "VirtualAccount"("idempotencyKey");

-- CreateIndex
CREATE INDEX "VirtualAccount_walletId_providerCode_status_idx" ON "VirtualAccount"("walletId", "providerCode", "status");
