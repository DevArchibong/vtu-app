
import { rateLimit } from "express-rate-limit";

const windowMs = 15 * 60 * 1000;

const rateLimitMessage = {
  error: "Too many requests. Please try again later.",
};

/**
 * Creates an IP-based rate limiter for a sensitive endpoint.
 */
export function createRateLimiter(limit: number) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitMessage,
  });
}

export const registrationRateLimiter = createRateLimiter(5);

export const loginRateLimiter = createRateLimiter(10);

export const phoneVerificationRequestRateLimiter =
  createRateLimiter(5);

export const phoneVerificationConfirmRateLimiter =
  createRateLimiter(10);
