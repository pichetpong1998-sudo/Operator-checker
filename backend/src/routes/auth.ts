import { Router } from "express";
import argon2 from "argon2";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/tokens";
import { writeAuditLog } from "../lib/audit";
import { requireAuth } from "../middleware/auth";
import { loginRateLimiter } from "../middleware/rateLimit";
import { HttpError } from "../middleware/errorHandler";

export const authRouter = Router();

const loginSchema = z.object({
  employeeCode: z.string().min(1),
  pin: z.string().min(4).max(12),
});

authRouter.post("/login", loginRateLimiter, async (req, res, next) => {
  try {
    const { employeeCode, pin } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { employeeCode } });

    // ใช้ generic error message เสมอ ป้องกัน user enumeration
    const genericError = () => res.status(401).json({ error: "invalid_credentials" });

    if (!user || user.status !== "active") {
      await writeAuditLog({
        action: "login_failed",
        req,
        metadata: { employeeCode, reason: "user_not_found_or_suspended" },
      });
      return genericError();
    }

    const pinValid = await argon2.verify(user.pinHash, pin);
    if (!pinValid) {
      await writeAuditLog({
        actorUserId: user.id,
        action: "login_failed",
        req,
        metadata: { reason: "invalid_pin" },
      });
      return genericError();
    }

    const accessToken = signAccessToken({
      sub: user.id,
      employeeCode: user.employeeCode,
      role: user.role,
      tokenVersion: user.tokenVersion,
    });
    const refreshToken = signRefreshToken({ sub: user.id, tokenVersion: user.tokenVersion });

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await writeAuditLog({ actorUserId: user.id, action: "login_success", req });

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        employeeCode: user.employeeCode,
        fullName: user.fullName,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
});

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

authRouter.post("/refresh", async (req, res, next) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new HttpError(401, "invalid_or_expired_refresh_token");
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== "active" || user.tokenVersion !== payload.tokenVersion) {
      throw new HttpError(401, "token_revoked");
    }

    const accessToken = signAccessToken({
      sub: user.id,
      employeeCode: user.employeeCode,
      role: user.role,
      tokenVersion: user.tokenVersion,
    });

    res.json({ accessToken });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", requireAuth, async (req, res, next) => {
  try {
    // bump tokenVersion เพื่อ revoke refresh token ทั้งหมดของผู้ใช้นี้ทันที
    await prisma.user.update({
      where: { id: req.user!.sub },
      data: { tokenVersion: { increment: 1 } },
    });
    await writeAuditLog({ actorUserId: req.user!.sub, action: "logout", req });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

const changePinSchema = z.object({
  currentPin: z.string().min(4).max(12),
  newPin: z.string().min(4).max(12),
});

authRouter.post("/change-pin", requireAuth, async (req, res, next) => {
  try {
    const { currentPin, newPin } = changePinSchema.parse(req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.sub } });

    const valid = await argon2.verify(user.pinHash, currentPin);
    if (!valid) throw new HttpError(401, "invalid_current_pin");

    const newHash = await argon2.hash(newPin, { type: argon2.argon2id });
    await prisma.user.update({
      where: { id: user.id },
      data: { pinHash: newHash, tokenVersion: { increment: 1 } },
    });

    await writeAuditLog({ actorUserId: user.id, action: "pin_change", req });
    res.json({ ok: true, message: "PIN changed. Please log in again." });
  } catch (err) {
    next(err);
  }
});
