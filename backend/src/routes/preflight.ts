import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { evaluateGeofence } from "../lib/geo";
import { signPreflightToken } from "../lib/tokens";
import { writeAuditLog } from "../lib/audit";
import { env } from "../config/env";
import { HttpError } from "../middleware/errorHandler";

export const preflightRouter = Router();

preflightRouter.use(requireAuth, requireRole("operator", "engineer", "admin"));

const gpsCheckSchema = z.object({
  beltHeadCode: z.string().min(1),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyM: z.number().min(0),
});

/**
 * ตรวจ GPS ก่อนเปิด checklist — server เป็นผู้ตัดสินใจทั้งหมด (ไม่เชื่อ client)
 * ปฏิเสธทันทีถ้า accuracy เกิน MAX_GPS_ACCURACY_M หรืออยู่นอกรัศมี geofence
 */
preflightRouter.post("/gps-check", async (req, res, next) => {
  try {
    const data = gpsCheckSchema.parse(req.body);

    const beltHead = await prisma.beltHead.findUnique({
      where: { code: data.beltHeadCode },
      include: { geofence: true },
    });
    if (!beltHead || !beltHead.geofence) throw new HttpError(404, "belt_head_or_geofence_not_found");

    const result = evaluateGeofence({
      deviceLat: data.latitude,
      deviceLng: data.longitude,
      deviceAccuracyM: data.accuracyM,
      fenceLat: Number(beltHead.geofence.latitude),
      fenceLng: Number(beltHead.geofence.longitude),
      fenceRadiusM: beltHead.geofence.radiusM,
      maxAccuracyM: env.MAX_GPS_ACCURACY_M,
    });

    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: "geofence_check",
      targetType: "belt_head",
      targetId: beltHead.id,
      req,
      metadata: { ...data, result },
    });

    if (!result.allowed) {
      return res.status(403).json({
        allowed: false,
        reason: result.reason,
        distanceM: Number.isNaN(result.distanceM) ? null : Math.round(result.distanceM),
        maxAccuracyM: env.MAX_GPS_ACCURACY_M,
        radiusM: beltHead.geofence.radiusM,
      });
    }

    const preflightToken = signPreflightToken({ sub: req.user!.sub, beltHeadId: beltHead.id });

    res.json({
      allowed: true,
      distanceM: Math.round(result.distanceM),
      radiusM: beltHead.geofence.radiusM,
      preflightToken,
      expiresInMin: env.PREFLIGHT_TOKEN_TTL_MIN,
    });
  } catch (err) {
    next(err);
  }
});
