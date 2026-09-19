import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import type { Prisma } from "@prisma/client";

export const auditRouter = Router();

auditRouter.use(requireAuth, requireRole("admin"));

auditRouter.get("/", async (req, res, next) => {
  try {
    const { action, actorUserId, from, to, limit = "100" } = req.query as Record<string, string>;
    const where: Prisma.AuditLogWhereInput = {};
    if (action) where.action = action as any;
    if (actorUserId) where.actorUserId = actorUserId;
    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as any).gte = new Date(from);
      if (to) (where.createdAt as any).lte = new Date(to);
    }

    const logs = await prisma.auditLog.findMany({
      where,
      include: { actor: { select: { fullName: true, employeeCode: true } } },
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(limit) || 100, 1000),
    });
    res.json(logs);
  } catch (err) {
    next(err);
  }
});
