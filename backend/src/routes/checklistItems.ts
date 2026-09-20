import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { writeAuditLog } from "../lib/audit";

export const checklistItemsRouter = Router();

checklistItemsRouter.use(requireAuth);

const CHECKLIST_CATEGORIES = [
  "drive_unit_1", "drive_unit_2", "drive_unit_3", "drive_unit_4",
  "belt_cleaner_primary", "belt_cleaner_secondary", "impact_carry_return",
  "chute_dust", "belt_condition", "pulley_primary", "pulley_secondary",
  "pulley_takeup", "pulley_tail", "crossbar_spillage",
] as const;

// รายการตรวจมาตรฐาน ใช้เหมือนกันทุกหัวสายพาน (S2C, S2B, S2A, S2, S3, S5, B1, B2, B3, C1, C2)
// เฉพาะรายการที่ active — ใช้โดย operator (หน้า checklist) และ engineer (หน้า dashboard detail)
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

// สำหรับหน้า Admin จัดการรายการตรวจ — เห็นทุกรายการรวมที่ปิดใช้งานแล้วด้วย
checklistItemsRouter.get("/all", requireRole("admin"), async (_req, res, next) => {
  try {
    const items = await prisma.checklistItemDef.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }] });
    res.json(items);
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  code: z.string().min(1).regex(/^[A-Z0-9_]+$/, "code ต้องเป็นตัวพิมพ์ใหญ่ ตัวเลข หรือ _ เท่านั้น"),
  category: z.enum(CHECKLIST_CATEGORIES),
  labelTh: z.string().min(1),
  labelEn: z.string().min(1),
  inputType: z.enum(["pass_fail_na", "numeric"]),
  unit: z.string().optional(),
  thresholdMin: z.number().optional(),
  thresholdMax: z.number().optional(),
  sortOrder: z.number().optional(),
});

checklistItemsRouter.post("/", requireRole("admin"), async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const item = await prisma.checklistItemDef.create({ data });
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: "user_create",
      targetType: "checklist_item",
      targetId: item.id,
      req,
      metadata: { code: item.code },
    });
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

const updateSchema = z.object({
  category: z.enum(CHECKLIST_CATEGORIES).optional(),
  labelTh: z.string().min(1).optional(),
  labelEn: z.string().min(1).optional(),
  inputType: z.enum(["pass_fail_na", "numeric"]).optional(),
  unit: z.string().nullable().optional(),
  thresholdMin: z.number().nullable().optional(),
  thresholdMax: z.number().nullable().optional(),
  sortOrder: z.number().optional(),
  active: z.boolean().optional(),
});

checklistItemsRouter.patch("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const data = updateSchema.parse(req.body);
    const item = await prisma.checklistItemDef.update({ where: { id: req.params.id }, data });
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: "user_update",
      targetType: "checklist_item",
      targetId: item.id,
      req,
      metadata: data,
    });
    res.json(item);
  } catch (err) {
    next(err);
  }
});
