
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
  
  export class PaymentWebhookError extends Error {
    constructor(
      message: string,
      public readonly statusCode: 400 | 401 | 503,
      public readonly code: string,
    ) {
      super(message);
      this.name = "PaymentWebhookError";
    }
  }
  
  export interface PaymentWebhookProvider {
    readonly providerCode: string;
    readonly signatureHeaderName: string;
  
    verifyAndParseNotification(
      request: PaymentWebhookRequest,
    ): Promise<VerifiedPaymentNotification>;
  }
  