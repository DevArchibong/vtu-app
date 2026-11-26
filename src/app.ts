
import express from "express";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import {
  registrationRateLimiter,
  loginRateLimiter,
  phoneVerificationRequestRateLimiter,
  phoneVerificationConfirmRateLimiter,
  identityVerificationRateLimiter,
} from "./middleware/rateLimiters.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { loginRouter } from "./routes/login.js";
import { profileRouter } from "./routes/profile.js";
import { phoneVerificationRouter } from "./routes/phoneVerification.js";
import { dataCatalogueRouter } from "./routes/dataCatalogue.js";
import { walletRouter } from "./routes/wallet.js";
import { createIdentityVerificationRouter } from "./routes/identityVerification.js";
import { createVirtualAccountRouter } from "./routes/virtualAccount.js";
import { createPaymentWebhookRouter } from "./routes/paymentWebhook.js";


export const app = express();

// Payment webhooks must receive the original raw request body.
app.use(
  "/api/webhooks/payments",
  createPaymentWebhookRouter(null),
);

// Parse JSON for the remaining API routes.
app.use(express.json());

// Rate limits apply only to these sensitive endpoints.
app.use("/api/auth/register", registrationRateLimiter);
app.use("/api/auth/login", loginRateLimiter);
app.use(
  "/api/auth/phone-verification/request",
  phoneVerificationRequestRateLimiter,
);
app.use(
  "/api/auth/phone-verification/confirm",
  phoneVerificationConfirmRateLimiter,
);
app.use(
  "/api/identity/verify",
  identityVerificationRateLimiter,
);

app.use("/api", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/auth/login", loginRouter);
app.use("/api/auth/phone-verification", phoneVerificationRouter);
app.use("/api", profileRouter);
app.use("/api", dataCatalogueRouter);
app.use("/api", walletRouter);
app.use("/api/identity", createIdentityVerificationRouter(null)
);
app.use(
  "/api/wallet/virtual-account",
  createVirtualAccountRouter(null),
);
app.use(notFoundHandler);
app.use(errorHandler);
