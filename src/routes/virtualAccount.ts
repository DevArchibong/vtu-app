
import { Router, type Response, type NextFunction } from "express";

import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/authenticate.js";

import {
  requestVirtualAccount,
  VirtualAccountError,
} from "../services/virtualAccountService.js";

import type {
  VirtualAccountProvider,
} from "../providers/virtualAccountProvider.js";

export function createVirtualAccountRouter(
  provider: VirtualAccountProvider | null,
) {
  const router = Router();

  router.post(
    "/",
    authenticate,
    async (
      req: AuthenticatedRequest,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      if (!provider) {
        res.status(503).json({
          message: "Virtual account service is currently unavailable.",
          code: "VIRTUAL_ACCOUNT_PROVIDER_UNAVAILABLE",
        });
        return;
      }

      try {
        const account = await requestVirtualAccount(
          req.user!.id,
          provider,
        );

        const statusCode =
          account.status === "ACTIVE" ? 200 : 202;

        res.status(statusCode).json({
          message:
            account.status === "ACTIVE"
              ? "Virtual account is available."
              : "Virtual account request is awaiting reconciliation.",
          virtualAccount: account,
        });
      } catch (error) {
        if (error instanceof VirtualAccountError) {
          const statusCodes: Record<string, number> = {
            INVALID_USER_ID: 400,
            USER_NOT_FOUND: 404,
            IDENTITY_VERIFICATION_REQUIRED: 403,
            INVALID_PROVIDER_CONFIGURATION: 503,
            VIRTUAL_ACCOUNT_OUTCOME_UNCERTAIN: 202,
            INVALID_PROVIDER_RESPONSE: 202,
          };

          res.status(statusCodes[error.code] ?? 400).json({
            message: error.message,
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
