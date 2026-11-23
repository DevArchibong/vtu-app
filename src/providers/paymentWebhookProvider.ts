
export interface PaymentWebhookRequest {
    rawBody: Buffer;
    signature: string | undefined;
    headers: Record<string, string | string[] | undefined>;
  }
  
  export interface VerifiedPaymentNotification {
    providerCode: string;
    providerReference: string;
    providerTransactionId: string;
    accountNumber: string;
    amountKobo: number;
    currency: string;
    status: "SUCCESS" | "FAILED";
  }
  
  export interface PaymentWebhookProvider {
    readonly providerCode: string;
  
    verifyAndParseNotification(
      request: PaymentWebhookRequest,
    ): Promise<VerifiedPaymentNotification>;
  }
  