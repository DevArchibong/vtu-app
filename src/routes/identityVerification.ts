
import {
  Router,
  type Response,
  type NextFunction,
} from "express";

import { authenticate } from "../middleware/authenticate.js";
import type { AuthenticatedRequest } from "../middleware/authenticate.js";

import {
  IdentityVerificationError,
  verifyCustomerIdentity,
} from "../services/identityVerificationService.js";

import type {
  IdentityType,
  IdentityVerificationProvider,
} from "../providers/identityVerificationProvider.js";

export function createIdentityVerificationRouter(
  provider: IdentityVerificationProvider | null,
) {
  const router = Router();

  router.post(
    "/verify",
    authenticate,
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

        const {
          identityType,
          identityNumber,
          privacyNoticeAcknowledged,
        } = req.body ?? {};

        if (
          (identityType !== "NIN" && identityType !== "BVN") ||
          typeof identityNumber !== "string"
        ) {
          res.status(400).json({
            error: {
              message: "Provide a valid identity type and identity number.",
              code: "INVALID_REQUEST",
            },
          });
          return;
        }

        if (privacyNoticeAcknowledged !== true) {
          res.status(400).json({
            error: {
              message: "You must acknowledge the privacy notice before identity verification.",
              code: "PRIVACY_NOTICE_ACKNOWLEDGEMENT_REQUIRED",
            },
          });
          return;
        }

        if (!provider) {
          res.status(503).json({
            error: {
              message: "Identity verification is temporarily unavailable.",
              code: "IDENTITY_PROVIDER_UNAVAILABLE",
            },
          });
          return;
        }

        const result = await verifyCustomerIdentity(
          req.user.id,
          identityType as IdentityType,
          identityNumber,
          provider,
          privacyNoticeAcknowledged,
        );

        res.status(200).json(result);
      } catch (error) {
        if (!(error instanceof IdentityVerificationError)) {
          next(error);
          return;
        }

        const statusCodes: Record<string, number> = {
          USER_NOT_FOUND: 404,
          IDENTITY_ALREADY_VERIFIED: 409,
          IDENTITY_REVIEW_REQUIRED: 409,
          PROVIDER_MISMATCH: 409,
          IDENTITY_NUMBER_MISMATCH: 409,
          IDENTITY_COMPLIANCE_MISMATCH: 409,
          INVALID_IDENTITY_TYPE: 400,
          INVALID_IDENTITY_NUMBER: 400,
          INVALID_REQUEST: 400,
          PRIVACY_NOTICE_ACKNOWLEDGEMENT_REQUIRED: 400,
          IDENTITY_CONFIGURATION_ERROR: 500,
          IDENTITY_COMPLIANCE_CONFIGURATION_ERROR: 503,
          IDENTITY_PROVIDER_UNAVAILABLE: 503,
          INVALID_PROVIDER_RESPONSE: 502,
        };

        res.status(statusCodes[error.code] ?? 400).json({
          error: {
            message: error.message,
            code: error.code,
          },
        });
      }
    },
  );

  return router;
}
