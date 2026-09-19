import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

export const checklistItemsRouter = Router();

checklistItemsRouter.use(requireAuth);

// รายการตรวจมาตรฐาน ใช้เหมือนกันทุกหัวสายพาน (S2C, S2B, S2A, S2, S3, S5, B1, B2, B3, C1, C2)
checklistItemsRouter.get("/", async (_req, res, next) => {
  try {
    const items = await prisma.checklistItemDef.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
});
