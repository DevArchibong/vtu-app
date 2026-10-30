
import { Router } from "express";
import bcrypt from "bcryptjs";
import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { normalizePhoneNumber } from "../services/phoneNumberService.js";

export const authRouter = Router();


authRouter.post("/register", async (req, res, next) => {
    try {
      const { fullName, phoneNumber, email, password } = req.body ?? {};
  
      if (
        typeof fullName !== "string" ||
        !fullName.trim() ||
        fullName.trim().length > 100
      ) {
        res.status(400).json({
          error: "Full name is required and must not exceed 100 characters.",
        });
        return;
      }
  
      if (
        typeof phoneNumber !== "string" ||
        !normalizePhoneNumber(phoneNumber)
      ) {
        res.status(400).json({
          error: "Enter a valid Nigerian mobile phone number.",
        });
        return;
      }
  
      if (
        typeof password !== "string" ||
        password.length < 8 ||
        Buffer.byteLength(password, "utf8") > 72
      ) {
        res.status(400).json({
          error: "Password must be at least 8 characters and at most 72 bytes.",
        });
        return;
      }
  
      let normalizedEmail: string | null = null;
  
      if (email !== undefined && email !== null && email !== "") {
        if (typeof email !== "string") {
          res.status(400).json({ error: "Invalid email address." });
          return;
        }
  
        normalizedEmail = email.trim().toLowerCase();
  
        if (
          normalizedEmail.length > 254 ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
        ) {
          res.status(400).json({ error: "Invalid email address." });
          return;
        }
      }
  
      const normalizedPhone = normalizePhoneNumber(phoneNumber)!;
  
      //console.time("Registration: password hashing");
      const passwordHash = await bcrypt.hash(password, 12);
      //console.timeEnd("Registration: password hashing");
  
      //console.time("Registration: database insert");
  
      const user = await prisma.user.create({
        data: {
          fullName: fullName.trim(),
          phoneNumber: normalizedPhone,
          email: normalizedEmail,
          passwordHash,
        },
        select: {
          id: true,
          fullName: true,
          phoneNumber: true,
          email: true,
          role: true,
          phoneVerifiedAt: true,
          createdAt: true,
        },
      });
  
      //console.timeEnd("Registration: database insert");
  
      res.status(201).json({
        message: "Account created. Verify your phone number to continue.",
        user,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        res.status(409).json({
          error: "An account with that phone number or email already exists.",
        });
        return;
      }
  
      next(error);
    }
  });
  
