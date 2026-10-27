
import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/tokens.js";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: "CUSTOMER" | "ADMIN";
  };
}

export function authenticate(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    res.status(401).json({
      error: "Authentication required.",
    });
    return;
  }

  const token = authorization.slice("Bearer ".length).trim();

  if (!token) {
    res.status(401).json({
      error: "Authentication required.",
    });
    return;
  }

  try {
    const payload = verifyAccessToken(token);

    req.user = {
      id: payload.sub,
      role: payload.role,
    };

    next();
  } catch {
    res.status(401).json({
      error: "Invalid or expired access token.",
    });
  }
}
