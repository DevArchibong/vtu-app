export interface CreateVirtualAccountInput {
    userId: string;
    fullName: string;
    email?: string;
    phoneNumber: string;
    idempotencyKey: string;
  }
  
  export interface VirtualAccountProviderResult {
    providerCode: string;
    providerAccountId: string;
    accountNumber: string;
    bankName: string;
    accountName: string;
  }
  
  export interface VirtualAccountProvider {
    createDedicatedAccount(
      input: CreateVirtualAccountInput,
    ): Promise<VirtualAccountProviderResult>;
  }