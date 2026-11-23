-- CreateEnum
CREATE TYPE "IdentityVerificationLawfulBasis" AS ENUM ('CONSENT', 'CONTRACT', 'LEGAL_OBLIGATION', 'VITAL_INTEREST', 'PUBLIC_INTEREST', 'LEGITIMATE_INTEREST');

-- AlterTable
ALTER TABLE "IdentityVerification" ADD COLUMN     "consentedAt" TIMESTAMP(3),
ADD COLUMN     "lawfulBasis" "IdentityVerificationLawfulBasis",
ADD COLUMN     "noticeAcknowledgedAt" TIMESTAMP(3),
ADD COLUMN     "privacyNoticeVersion" TEXT;
