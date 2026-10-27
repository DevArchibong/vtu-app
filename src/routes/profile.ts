
import { Router } from "express";
import {
  authenticate,
  type AuthenticatedRequest,
} from "../middleware/authenticate.js";

export const profileRouter = Router();

profileRouter.get(
  "/me",
  authenticate,
  (req: AuthenticatedRequest, res) => {
    res.status(200).json({
      user: {
        id: req.user!.id,
        role: req.user!.role,
      },
    });
  },
);
