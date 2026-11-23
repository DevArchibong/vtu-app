
const allowedLawfulBases = [
    "CONSENT",
    "CONTRACT",
    "LEGAL_OBLIGATION",
    "VITAL_INTEREST",
    "PUBLIC_INTEREST",
    "LEGITIMATE_INTEREST",
  ] as const;
  
  export type IdentityVerificationLawfulBasis =
    (typeof allowedLawfulBases)[number];
  
  export interface IdentityVerificationComplianceConfig {
    lawfulBasis: IdentityVerificationLawfulBasis;
    privacyNoticeVersion: string;
  }
  
  export function getIdentityVerificationComplianceConfig():
    | IdentityVerificationComplianceConfig
    | null {
    const lawfulBasis = process.env.KYC_LAWFUL_BASIS;
    const privacyNoticeVersion =
      process.env.KYC_PRIVACY_NOTICE_VERSION?.trim();
  
    if (
      !lawfulBasis ||
      !allowedLawfulBases.includes(
        lawfulBasis as IdentityVerificationLawfulBasis,
      ) ||
      !privacyNoticeVersion
    ) {
      return null;
    }
  
    return {
      lawfulBasis: lawfulBasis as IdentityVerificationLawfulBasis,
      privacyNoticeVersion,
    };
  }
  