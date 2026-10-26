
import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";

export const loginRouter = Router();

function normalizePhoneNumber(phone: string): string | null {
  const cleaned = phone.replace(/[\s()-]/g, "");

  let international: string;

  if (/^0\d{10}$/.test(cleaned)) {
    international = `+234${cleaned.slice(1)}`;
  } else if (/^234\d{10}$/.test(cleaned)) {
    international = `+${cleaned}`;
  } else if (/^\+234\d{10}$/.test(cleaned)) {
    international = cleaned;
  } else {
    return null;
  }

  return /^\+234(?:70|71|80|81|90|91)\d{8}$/.test(international)
    ? international
    : null;
}

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

    res.status(200).json({
      message: "Login credentials verified.",
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
