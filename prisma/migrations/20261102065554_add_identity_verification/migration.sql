-- CreateEnum
CREATE TYPE "IdentityType" AS ENUM ('NIN', 'BVN');

-- CreateEnum
CREATE TYPE "IdentityVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'REVIEW_REQUIRED');

-- CreateTable
CREATE TABLE "IdentityVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "identityType" "IdentityType" NOT NULL,
    "status" "IdentityVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "providerCode" TEXT NOT NULL,
    "providerReference" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IdentityVerification_providerReference_key" ON "IdentityVerification"("providerReference");

-- CreateIndex
CREATE INDEX "IdentityVerification_userId_status_idx" ON "IdentityVerification"("userId", "status");

-- CreateIndex
CREATE INDEX "IdentityVerification_userId_identityType_idx" ON "IdentityVerification"("userId", "identityType");

-- AddForeignKey
ALTER TABLE "IdentityVerification" ADD CONSTRAINT "IdentityVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
