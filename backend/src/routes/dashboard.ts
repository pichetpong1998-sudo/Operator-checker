import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth, requireRole("engineer", "admin"));

/**
 * สถานะแต่ละหัวสายพาน:
 * - Down: มี inspection ล่าสุดที่มีผล fail อย่างน้อย 1 รายการ
 * - Warning: มี threshold_breached แต่ไม่มี fail
 * - Ready: ผลล่าสุดผ่านหมด
 * - No Data: ยังไม่มีการตรวจในช่วงเวลาที่กำหนด (default 8 ชม.ล่าสุด)
 */
dashboardRouter.get("/status", async (req, res, next) => {
  try {
    const windowHours = Number(req.query.windowHours ?? 8);
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

    const beltHeads = await prisma.beltHead.findMany({ where: { active: true }, orderBy: { code: "asc" } });

    const statuses = await Promise.all(
      beltHeads.map(async (bh) => {
        const latest = await prisma.inspection.findFirst({
          where: { beltHeadId: bh.id, createdAt: { gte: since } },
          orderBy: { createdAt: "desc" },
          include: { results: true, operator: { select: { fullName: true } } },
        });

        if (!latest) return { beltHeadCode: bh.code, status: "no_data" as const, lastInspectionAt: null };

        const hasFail = latest.results.some((r) => r.resultValue === "fail");
        const hasWarning = latest.results.some((r) => r.thresholdBreached);

        const status = hasFail ? "down" : hasWarning ? "warning" : "ready";

        return {
          beltHeadCode: bh.code,
          status,
          lastInspectionAt: latest.createdAt,
          lastOperator: latest.operator.fullName,
          inspectionId: latest.id,
        };
      })
    );

    res.json(statuses);
  } catch (err) {
    next(err);
  }
});

// ความคืบหน้าการตรวจในกะปัจจุบัน (กี่หัวจาก 11 หัวที่ตรวจแล้ว)
dashboardRouter.get("/shift-progress", async (req, res, next) => {
  try {
    const shiftName = (req.query.shiftName as string) ?? undefined;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const totalBeltHeads = await prisma.beltHead.count({ where: { active: true } });
    const inspectedBeltHeadIds = await prisma.inspection.findMany({
      where: {
        createdAt: { gte: startOfDay },
        ...(shiftName ? { shiftName } : {}),
      },
      distinct: ["beltHeadId"],
      select: { beltHeadId: true },
    });

    res.json({
      totalBeltHeads,
      inspectedCount: inspectedBeltHeadIds.length,
      progressPercent: totalBeltHeads > 0 ? Math.round((inspectedBeltHeadIds.length / totalBeltHeads) * 100) : 0,
    });
  } catch (err) {
    next(err);
  }
});

// Trend ของค่าตัวเลข (เช่น อุณหภูมิ/แรงดัน) ย้อนหลังต่อ checklist item + belt head
dashboardRouter.get("/trends", async (req, res, next) => {
  try {
    const { checklistItemCode, beltHeadCode, days = "30" } = req.query as Record<string, string>;
    if (!checklistItemCode || !beltHeadCode) {
      return res.status(400).json({ error: "checklistItemCode_and_beltHeadCode_required" });
    }

    const since = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);

    const results = await prisma.inspectionResult.findMany({
      where: {
        checklistItem: { code: checklistItemCode },
        inspection: { beltHead: { code: beltHeadCode }, createdAt: { gte: since } },
      },
      include: { inspection: { select: { createdAt: true } } },
      orderBy: { inspection: { createdAt: "asc" } },
    });

    res.json(
      results.map((r) => ({
        timestamp: r.inspection.createdAt,
        numericValue: r.numericValue,
        thresholdBreached: r.thresholdBreached,
      }))
    );
  } catch (err) {
    next(err);
  }
});
