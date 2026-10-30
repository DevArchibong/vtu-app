
import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { createAccessToken } from "../lib/tokens.js";
import { normalizePhoneNumber } from "../services/phoneNumberService.js";

export const loginRouter = Router();


loginRouter.post("/", async (req, res, next) => {
  try {
    const { phoneNumber, password } = req.body ?? {};

    if (
      typeof phoneNumber !== "string" ||
      !normalizePhoneNumber(phoneNumber) ||
      typeof password !== "string" ||
      password.length === 0 ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      res.status(400).json({
        error: "Enter a valid phone number and password.",
      });
      return;
    }

    const normalizedPhone = normalizePhoneNumber(phoneNumber)!;

    const user = await prisma.user.findUnique({
      where: { phoneNumber: normalizedPhone },
    });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      res.status(401).json({
        error: "Invalid phone number or password.",
      });
      return;
    }

    if (!user.phoneVerifiedAt) {
      res.status(403).json({
        error: "Verify your phone number before logging in.",
        code: "PHONE_NOT_VERIFIED",
      });
      return;
    }

    const accessToken = createAccessToken(user.id, user.role);

    res.status(200).json({
      message: "Login successful.",
      accessToken,
      tokenType: "Bearer",
      expiresIn: 900,
      user: {
        id: user.id,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        email: user.email,
        role: user.role,
        phoneVerifiedAt: user.phoneVerifiedAt,
      },
    });
    
   
  } catch (error) {
    next(error);
  }
});
