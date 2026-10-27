
import jwt from "jsonwebtoken";
import "dotenv/config";

function getAccessTokenSecret(): string {
    const secret = process.env.JWT_ACCESS_SECRET;
  
    if (!secret || secret.length < 64) {
      throw new Error(
        "JWT_ACCESS_SECRET must contain at least 32 random bytes encoded as hex.",
      );
    }
  
    return secret;
  }
  
  const accessTokenSecret = getAccessTokenSecret();
export type UserRole = "CUSTOMER" | "ADMIN";

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
}

export function createAccessToken(
  userId: string,
  role: UserRole,
): string {
  return jwt.sign(
    { role },
    accessTokenSecret,
    {
      subject: userId,
      expiresIn: "15m",
      issuer: "vtu-app",
      audience: "vtu-app-api",
      algorithm: "HS256",
    },
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, accessTokenSecret, {
    issuer: "vtu-app",
    audience: "vtu-app-api",
    algorithms: ["HS256"],
  });

  if (
    typeof payload === "string" ||
    typeof payload.sub !== "string" ||
    (payload.role !== "CUSTOMER" && payload.role !== "ADMIN")
  ) {
    throw new jwt.JsonWebTokenError("Invalid access token payload.");
  }

  return {
    sub: payload.sub,
    role: payload.role,
    iat: payload.iat,
    exp: payload.exp,
    iss: payload.iss,
    aud: payload.aud,
  };
}
