
import express, {
    Router,
    type Request,
    type Response,
    type NextFunction,
  } from "express";
  
  import {
    PaymentWebhookError,
    type PaymentWebhookProvider,
  } from "../providers/paymentWebhookProvider.js";
  
  import {
    processVerifiedPaymentNotification,
    WalletFundingError,
  } from "../services/walletFundingService.js";
  
  export function createPaymentWebhookRouter(
    provider: PaymentWebhookProvider | null,
  ) {
    const router = Router();
  
    router.post(
      "/",
      express.raw({
        type: "application/json",
        limit: "256kb",
      }),
      async (
        req: Request,
        res: Response,
        next: NextFunction,
      ): Promise<void> => {
        if (!provider) {
          res.status(503).json({
            message: "Payment webhook provider is not configured.",
            code: "PAYMENT_WEBHOOK_PROVIDER_UNAVAILABLE",
          });
          return;
        }
  
        if (!Buffer.isBuffer(req.body)) {
          res.status(400).json({
            message: "Expected a raw JSON request body.",
            code: "INVALID_WEBHOOK_BODY",
          });
          return;
        }
  
        const signatureHeaderName =
          provider.signatureHeaderName.toLowerCase();
  
        const signatureValue =
          req.headers[signatureHeaderName];
  
        const signature =
          typeof signatureValue === "string"
            ? signatureValue
            : undefined;
  
        try {
          const notification =
            await provider.verifyAndParseNotification({
              rawBody: req.body,
              signature,
              headers: req.headers,
            });
  
          if (notification.providerCode !== provider.providerCode) {
            res.status(401).json({
              message: "Payment provider identity mismatch.",
              code: "PAYMENT_PROVIDER_MISMATCH",
            });
            return;
          }
  
          const result =
            await processVerifiedPaymentNotification(notification);
  
          res.status(200).json({
            received: true,
            status: result.status,
            fundingId: result.fundingId,
            ...(result.status === "REVIEW_REQUIRED"
              ? { reason: result.reason }
              : {}),
          });
        } catch (error) {
          if (error instanceof PaymentWebhookError) {
            res.status(error.statusCode).json({
              message: error.message,
              code: error.code,
            });
            return;
          }
  
          if (error instanceof WalletFundingError) {
            const statusCodes: Record<string, number> = {
              INVALID_PROVIDER_CODE: 400,
              INVALID_PAYMENT_REFERENCE: 400,
              INVALID_PROVIDER_TRANSACTION_ID: 400,
              INVALID_ACCOUNT_NUMBER: 400,
              INVALID_PAYMENT_AMOUNT: 400,
              UNSUPPORTED_CURRENCY: 400,
              INVALID_PAYMENT_STATUS: 400,
              VIRTUAL_ACCOUNT_NOT_FOUND: 503,
              PAYMENT_REFERENCE_CONFLICT: 409,
              WALLET_NOT_FOUND: 503,
              WALLET_BALANCE_LIMIT_EXCEEDED: 409,
            };
  
            const statusCode =
              statusCodes[error.code] ?? 500;
  
            res.status(statusCode).json({
              message:
                statusCode >= 500
                  ? "Payment notification could not be processed."
                  : error.message,
              code: error.code,
            });
  
            return;
          }
  
          next(error);
        }
      },
    );
  
    return router;
  }
  