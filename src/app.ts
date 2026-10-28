
import express from "express";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { loginRouter } from "./routes/login.js";
import { profileRouter } from "./routes/profile.js";
import { phoneVerificationRouter } from "./routes/phoneVerification.js";

export const app = express();

app.use(express.json());

app.use("/api", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/auth/login", loginRouter);
app.use("/api/auth/phone-verification", phoneVerificationRouter);
app.use("/api", profileRouter);

app.use(notFoundHandler);
app.use(errorHandler);
