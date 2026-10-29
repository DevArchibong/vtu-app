
import {
    Router,
    type Response,
    type NextFunction,
  } from "express";
  
  import type { AuthenticatedRequest } from "../middleware/authenticate.js";
  
  import {
    confirmPhoneVerification,
    PhoneVerificationError,
    requestPhoneVerification,
  } from "../services/phoneVerificationService.js";
  
  export const phoneVerificationRouter = Router();
  
  function handleVerificationError(
    error: unknown,
    res: Response,
    next: NextFunction,
  ): void {
    if (!(error instanceof PhoneVerificationError)) {
      next(error);
      return;
    }
    const statusCodes: Record<string, number> = {
        USER_NOT_FOUND: 404,
        PHONE_ALREADY_VERIFIED: 409,
        REQUEST_COOLDOWN: 429,
        INVALID_CODE_FORMAT: 400,
        CODE_NOT_FOUND: 400,
        NO_ACTIVE_CODE: 400,
        CODE_EXPIRED: 400,
        INCORRECT_CODE: 400,
        INVALID_CODE: 400,
        TOO_MANY_ATTEMPTS: 429,
        MAX_ATTEMPTS_EXCEEDED: 429,
        CODE_NO_LONGER_ACTIVE: 409,
        CODE_UNAVAILABLE: 409,
      };
    res.status(statusCodes[error.code] ?? 400).json({
      error: {
        message: error.message,
        code: error.code,
      },
    });
  }
  
  // POST /api/auth/phone-verification/request
  phoneVerificationRouter.post(
    "/request",
    authenticateRequest,
    async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      try {
        if (!req.user) {
          res.status(401).json({
            error: {
              message: "Authentication required.",
            },
          });
          return;
        }
  
        const result = await requestPhoneVerification(req.user.id);
  
        res.status(200).json(result);
      } catch (error) {
        handleVerificationError(error, res, next);
      }
    },
  );
  
  // POST /api/auth/phone-verification/confirm
  phoneVerificationRouter.post(
    "/confirm",
    authenticateRequest,
    async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      try {
        if (!req.user) {
          res.status(401).json({
            error: {
              message: "Authentication required.",
            },
          });
          return;
        }
  
        const { code } = req.body ?? {};
  
        if (typeof code !== "string") {
          res.status(400).json({
            error: {
              message: "Enter a valid six-digit verification code.",
              code: "INVALID_CODE_FORMAT",
            },
          });
          return;
        }
  
        const result = await confirmPhoneVerification(
          req.user.id,
          code,
        );
  
        res.status(200).json(result);
      } catch (error) {
        handleVerificationError(error, res, next);
      }
    },
  );
  
  // Express authentication middleware adapter.
  function authenticateRequest(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): void {
    authenticate(req, res, next);
  }
  
  import { authenticate } from "../middleware/authenticate.js";
  