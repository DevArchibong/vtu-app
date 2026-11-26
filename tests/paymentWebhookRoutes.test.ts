
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPaymentWebhookRouter } from "../src/routes/paymentWebhook.js";
import {
  PaymentWebhookError,
  type PaymentWebhookProvider,
  type VerifiedPaymentNotification,
} from "../src/providers/paymentWebhookProvider.js";

import { processVerifiedPaymentNotification } from "../src/services/walletFundingService.js";

vi.mock("../src/services/walletFundingService.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/services/walletFundingService.js")>();

  return {
    ...actual,
    processVerifiedPaymentNotification: vi.fn(),
  };
});

const mockedProcessPayment = vi.mocked(
  processVerifiedPaymentNotification,
);

const notification: VerifiedPaymentNotification = {
  providerCode: "TEST_PROVIDER",
  providerReference: "PAY-REF-001",
  providerTransactionId: "TXN-001",
  accountNumber: "0123456789",
  amountKobo: 50000,
  currency: "NGN",
  status: "SUCCESS",
};

function createTestApp(provider: PaymentWebhookProvider | null) {
  const app = express();

  // Webhook must come before express.json().
  app.use(
    "/api/webhooks/payments",
    createPaymentWebhookRouter(provider),
  );

  app.use(express.json());

  return app;
}

function createTestProvider(): PaymentWebhookProvider {
  return {
    providerCode: "TEST_PROVIDER",
    signatureHeaderName: "x-test-signature",
    verifyAndParseNotification: vi.fn().mockResolvedValue(notification),
  };
}

describe("Payment webhook routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 503 when no payment provider is configured", async () => {
    const app = createTestApp(null);

    const response = await request(app)
      .post("/api/webhooks/payments")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ event: "payment.success" }));

    expect(response.status).toBe(503);
    expect(response.body.code).toBe(
      "PAYMENT_WEBHOOK_PROVIDER_UNAVAILABLE",
    );
  });

  it("rejects a request that does not contain a raw JSON body", async () => {
    const provider = createTestProvider();
    const app = createTestApp(provider);

    const response = await request(app)
      .post("/api/webhooks/payments")
      .set("Content-Type", "text/plain")
      .send("payment notification");

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_WEBHOOK_BODY");
  });

  it("passes the raw body and signature to the provider", async () => {
    const provider = createTestProvider();
    const app = createTestApp(provider);

    const rawBody = JSON.stringify({ event: "payment.success" });

    mockedProcessPayment.mockResolvedValue({
      status: "CONFIRMED",
      duplicate: false,
      fundingId: "funding-001",
      transactionId: "transaction-001",
      balanceAfterKobo: 150000,
    });

    const response = await request(app)
      .post("/api/webhooks/payments")
      .set("Content-Type", "application/json")
      .set("x-test-signature", "valid-signature")
      .send(rawBody);

    expect(response.status).toBe(200);

    expect(provider.verifyAndParseNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        rawBody: Buffer.from(rawBody),
        signature: "valid-signature",
      }),
    );
  });

  it("rejects an invalid webhook signature", async () => {
    const provider = createTestProvider();

    vi.mocked(provider.verifyAndParseNotification).mockRejectedValue(
      new PaymentWebhookError(
        "Invalid webhook signature.",
        401,
        "INVALID_SIGNATURE",
      ),
    );

    const app = createTestApp(provider);

    const response = await request(app)
      .post("/api/webhooks/payments")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ event: "payment.success" }));

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("INVALID_SIGNATURE");
  });

  it("rejects a notification from a different provider", async () => {
    const provider = createTestProvider();

    vi.mocked(provider.verifyAndParseNotification).mockResolvedValue({
      ...notification,
      providerCode: "ANOTHER_PROVIDER",
    });

    const app = createTestApp(provider);

    const response = await request(app)
      .post("/api/webhooks/payments")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ event: "payment.success" }));

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("PAYMENT_PROVIDER_MISMATCH");
    expect(mockedProcessPayment).not.toHaveBeenCalled();
  });

  it("processes a valid payment notification", async () => {
    const provider = createTestProvider();
    const app = createTestApp(provider);

    mockedProcessPayment.mockResolvedValue({
      status: "CONFIRMED",
      duplicate: false,
      fundingId: "funding-001",
      transactionId: "transaction-001",
      balanceAfterKobo: 150000,
    });

    const response = await request(app)
      .post("/api/webhooks/payments")
      .set("Content-Type", "application/json")
      .set("x-test-signature", "valid-signature")
      .send(JSON.stringify({ event: "payment.success" }));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      received: true,
      status: "CONFIRMED",
      fundingId: "funding-001",
    });

    expect(mockedProcessPayment).toHaveBeenCalledWith(notification);
  });

  it("handles duplicate payment notifications without another credit", async () => {
    const provider = createTestProvider();
    const app = createTestApp(provider);

    mockedProcessPayment.mockResolvedValue({
      status: "DUPLICATE",
      duplicate: true,
      fundingId: "funding-001",
    });

    const response = await request(app)
      .post("/api/webhooks/payments")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ event: "payment.success" }));

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("DUPLICATE");
    expect(mockedProcessPayment).toHaveBeenCalledTimes(1);
  });
});
