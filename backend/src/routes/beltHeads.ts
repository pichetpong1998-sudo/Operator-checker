import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { writeAuditLog } from "../lib/audit";
import { HttpError } from "../middleware/errorHandler";

export const beltHeadsRouter = Router();

beltHeadsRouter.use(requireAuth);

// ทุก role อ่านรายการหัวสายพาน + geofence ได้ (จำเป็นสำหรับ operator เลือกหัวที่จะตรวจ)
beltHeadsRouter.get("/", async (_req, res, next) => {
  try {
    const beltHeads = await prisma.beltHead.findMany({
      where: { active: true },
      include: { geofence: true },
      orderBy: { code: "asc" },
    });
    res.json(beltHeads);
  } catch (err) {
    next(err);
  }
});

beltHeadsRouter.get("/:code/geofence", async (req, res, next) => {
  try {
    const beltHead = await prisma.beltHead.findUnique({
      where: { code: req.params.code },
      include: { geofence: true },
    });
    if (!beltHead || !beltHead.geofence) throw new HttpError(404, "geofence_not_found");
    res.json(beltHead.geofence);
  } catch (err) {
    next(err);
  }
});

const geofenceSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusM: z.number().min(5).max(500),
});

// Admin เท่านั้นที่ตั้งพิกัด/รัศมีได้ — ค่าเดียวใช้ร่วมกันทุกอุปกรณ์ (เก็บใน DB กลาง)
beltHeadsRouter.put("/:code/geofence", requireRole("admin"), async (req, res, next) => {
  try {
    const data = geofenceSchema.parse(req.body);
    const beltHead = await prisma.beltHead.findUnique({ where: { code: req.params.code } });
    if (!beltHead) throw new HttpError(404, "belt_head_not_found");

    const geofence = await prisma.geofence.upsert({
      where: { beltHeadId: beltHead.id },
      update: {
        latitude: data.latitude,
        longitude: data.longitude,
        radiusM: data.radiusM,
        updatedById: req.user!.sub,
      },
      create: {
        beltHeadId: beltHead.id,
        latitude: data.latitude,
        longitude: data.longitude,
        radiusM: data.radiusM,
        updatedById: req.user!.sub,
      },
    });

    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: "geofence_update",
      targetType: "belt_head",
      targetId: beltHead.id,
      req,
      metadata: data,
    });

    res.json(geofence);
  } catch (err) {
    next(err);
  }
});
