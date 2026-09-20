import { Router } from "express";
import argon2 from "argon2";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { writeAuditLog } from "../lib/audit";
import { HttpError } from "../middleware/errorHandler";

export const usersRouter = Router();

usersRouter.use(requireAuth, requireRole("admin"));

usersRouter.get("/", async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        employeeCode: true,
        fullName: true,
        role: true,
        status: true,
        email: true,
        lineUserId: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(users);
  } catch (err) {
    next(err);
  }
});

const createUserSchema = z.object({
  employeeCode: z.string().min(1),
  fullName: z.string().min(1),
  role: z.enum(["operator", "engineer", "admin"]),
  pin: z.string().min(4).max(12),
  email: z.string().email().optional(),
  lineUserId: z.string().optional(),
});

usersRouter.post("/", async (req, res, next) => {
  try {
    const data = createUserSchema.parse(req.body);
    const pinHash = await argon2.hash(data.pin, { type: argon2.argon2id });

    const user = await prisma.user.create({
      data: {
        employeeCode: data.employeeCode,
        fullName: data.fullName,
        role: data.role,
        pinHash,
        email: data.email,
        lineUserId: data.lineUserId,
      },
    });

    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: "user_create",
      targetType: "user",
      targetId: user.id,
      req,
      metadata: { employeeCode: user.employeeCode, role: user.role },
    });

    res.status(201).json({ id: user.id, employeeCode: user.employeeCode });
  } catch (err) {
    next(err);
  }
});

const updateUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  role: z.enum(["operator", "engineer", "admin"]).optional(),
  email: z.string().email().optional(),
  lineUserId: z.string().optional(),
});

usersRouter.patch("/:id", async (req, res, next) => {
  try {
    const data = updateUserSchema.parse(req.body);
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { ...data, tokenVersion: { increment: 1 } }, // role เปลี่ยน → revoke session เดิม
    });

    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: "user_update",
      targetType: "user",
      targetId: user.id,
      req,
      metadata: data,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

usersRouter.post("/:id/reset-pin", async (req, res, next) => {
  try {
    const { newPin } = z.object({ newPin: z.string().min(4).max(12) }).parse(req.body);
    const pinHash = await argon2.hash(newPin, { type: argon2.argon2id });

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { pinHash, tokenVersion: { increment: 1 } },
    });

    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: "pin_reset",
      targetType: "user",
      targetId: user.id,
      req,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

usersRouter.post("/:id/suspend", async (req, res, next) => {
  try {
    if (req.params.id === req.user!.sub) {
      throw new HttpError(400, "cannot_suspend_self");
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { status: "suspended", tokenVersion: { increment: 1 } },
    });

    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: "user_suspend",
      targetType: "user",
      targetId: user.id,
      req,
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

usersRouter.post("/:id/reactivate", async (req, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { status: "active" },
    });
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: "user_update",
      targetType: "user",
      targetId: user.id,
      req,
      metadata: { status: "active" },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
