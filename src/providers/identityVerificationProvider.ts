
export type IdentityType = "NIN" | "BVN";

export interface VerifyIdentityInput {
  userId: string;
  identityType: IdentityType;
  identityNumber: string;
  fullName: string;
  email?: string;
  phoneNumber: string;
  dateOfBirth?: string;
  idempotencyKey: string;
}

export type IdentityProviderStatus =
  | "VERIFIED"
  | "FAILED"
  | "REVIEW_REQUIRED";

export interface IdentityVerificationProviderResult {
  providerCode: string;
  providerReference: string;
  status: IdentityProviderStatus;
  failureCode?: string;
}

export interface IdentityVerificationProvider {
  readonly providerCode: string;

  verifyIdentity(
    input: VerifyIdentityInput,
  ): Promise<IdentityVerificationProviderResult>;
}
