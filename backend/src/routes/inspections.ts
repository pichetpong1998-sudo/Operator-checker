import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { evaluateGeofence } from "../lib/geo";
import { env } from "../config/env";
import { fireCriticalAlert } from "../lib/notify";
import { writeAuditLog } from "../lib/audit";
import { HttpError } from "../middleware/errorHandler";
import type { Prisma } from "@prisma/client";

export const inspectionsRouter = Router();

inspectionsRouter.use(requireAuth);

const gpsSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyM: z.number().min(0),
});

/**
 * ตรวจ geofence ซ้ำจาก DB จริง (ไม่เชื่อค่าที่ client อ้างว่าผ่าน preflight มาแล้ว)
 * ใช้ฟังก์ชันนี้ทั้งตอนเปิดรอบตรวจ, บันทึกผล, และ sync จาก offline queue
 */
async function reverifyGeofenceOrThrow(beltHeadId: string, gps: z.infer<typeof gpsSchema>) {
  const beltHead = await prisma.beltHead.findUnique({
    where: { id: beltHeadId },
    include: { geofence: true },
  });
  if (!beltHead || !beltHead.geofence) throw new HttpError(404, "belt_head_or_geofence_not_found");

  const result = evaluateGeofence({
    deviceLat: gps.latitude,
    deviceLng: gps.longitude,
    deviceAccuracyM: gps.accuracyM,
    fenceLat: Number(beltHead.geofence.latitude),
    fenceLng: Number(beltHead.geofence.longitude),
    fenceRadiusM: beltHead.geofence.radiusM,
    maxAccuracyM: env.MAX_GPS_ACCURACY_M,
  });

  if (!result.allowed) {
    throw new HttpError(403, "geofence_check_failed", { reason: result.reason, distanceM: result.distanceM });
  }
  return { beltHead, result };
}

const startInspectionSchema = z.object({
  beltHeadCode: z.string().min(1),
  shiftName: z.enum(["day", "night"]).optional(),
  deviceId: z.string().optional(),
  idempotencyKey: z.string().optional(),
  gps: gpsSchema,
});

// เปิดรอบตรวจใหม่ — server ตรวจ geofence ซ้ำจากพิกัดล่าสุดที่ส่งมา (ไม่ใช้ preflight token แทนการตรวจจริง)
inspectionsRouter.post("/", requireRole("operator", "engineer", "admin"), async (req, res, next) => {
  try {
    const data = startInspectionSchema.parse(req.body);
    const beltHead = await prisma.beltHead.findUnique({ where: { code: data.beltHeadCode } });
    if (!beltHead) throw new HttpError(404, "belt_head_not_found");

    const { result } = await reverifyGeofenceOrThrow(beltHead.id, data.gps);

    if (data.idempotencyKey) {
      const existing = await prisma.inspection.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
      if (existing) return res.status(200).json(existing);
    }

    const inspection = await prisma.inspection.create({
      data: {
        beltHeadId: beltHead.id,
        operatorId: req.user!.sub,
        shiftName: data.shiftName,
        checkInLat: data.gps.latitude,
        checkInLng: data.gps.longitude,
        checkInAccuracyM: data.gps.accuracyM,
        geofenceCheckPassed: true,
        geofenceDistanceM: result.distanceM,
        deviceId: data.deviceId,
        idempotencyKey: data.idempotencyKey,
        syncSource: "web",
      },
    });

    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: "inspection_start",
      targetType: "inspection",
      targetId: inspection.id,
      req,
      metadata: { beltHeadCode: data.beltHeadCode, distanceM: result.distanceM },
    });

    res.status(201).json(inspection);
  } catch (err) {
    next(err);
  }
});

const resultItemSchema = z.object({
  checklistItemId: z.string().uuid(),
  resultValue: z.enum(["pass", "fail", "na"]).optional(),
  numericValue: z.number().optional(),
  noteText: z.string().max(2000).optional(),
  voiceTranscript: z.string().max(5000).optional(),
});

const submitResultsSchema = z.object({
  gps: gpsSchema,
  results: z.array(resultItemSchema).min(1),
});

/**
 * บันทึกผลตรวจ — server ตรวจ geofence ซ้ำอีกครั้งจากพิกัด ณ ขณะนี้ก่อนรับข้อมูลทุกครั้ง
 * ตามข้อกำหนด "Server ต้องตรวจ Geofence ซ้ำก่อนรับผลตรวจทุกครั้ง"
 */
inspectionsRouter.post(
  "/:id/results",
  requireRole("operator", "engineer", "admin"),
  async (req, res, next) => {
    try {
      const inspection = await prisma.inspection.findUnique({ where: { id: req.params.id } });
      if (!inspection) throw new HttpError(404, "inspection_not_found");
      if (inspection.operatorId !== req.user!.sub && req.user!.role === "operator") {
        throw new HttpError(403, "not_inspection_owner");
      }

      const data = submitResultsSchema.parse(req.body);
      await reverifyGeofenceOrThrow(inspection.beltHeadId, data.gps);

      const checklistItems = await prisma.checklistItemDef.findMany({
        where: { id: { in: data.results.map((r) => r.checklistItemId) } },
      });
      const itemsById = new Map(checklistItems.map((i) => [i.id, i]));

      const savedResults: any[] = [];
      const alertsToFire: Array<{ item: (typeof checklistItems)[number]; r: (typeof data.results)[number]; reason: string }> = [];

      for (const r of data.results) {
        const item = itemsById.get(r.checklistItemId);
        if (!item) continue;

        let thresholdBreached = false;
        if (item.inputType === "numeric" && r.numericValue !== undefined) {
          const min = item.thresholdMin !== null ? Number(item.thresholdMin) : null;
          const max = item.thresholdMax !== null ? Number(item.thresholdMax) : null;
          if ((min !== null && r.numericValue < min) || (max !== null && r.numericValue > max)) {
            thresholdBreached = true;
          }
        }

        const saved = await prisma.inspectionResult.upsert({
          where: { inspectionId_checklistItemId: { inspectionId: inspection.id, checklistItemId: item.id } },
          update: {
            resultValue: r.resultValue,
            numericValue: r.numericValue,
            thresholdBreached,
            noteText: r.noteText,
            voiceTranscript: r.voiceTranscript,
          },
          create: {
            inspectionId: inspection.id,
            checklistItemId: item.id,
            resultValue: r.resultValue,
            numericValue: r.numericValue,
            thresholdBreached,
            noteText: r.noteText,
            voiceTranscript: r.voiceTranscript,
          },
        });
        savedResults.push(saved);

        if (r.resultValue === "fail") {
          alertsToFire.push({ item, r, reason: "fail" });
        } else if (thresholdBreached) {
          alertsToFire.push({ item, r, reason: "threshold_exceeded" });
        }
      }

      // ยิง alert แบบ fire-and-forget (ไม่ block response หลัก แต่ log error ถ้าล้มเหลว)
      if (alertsToFire.length > 0) {
        const beltHead = await prisma.beltHead.findUnique({ where: { id: inspection.beltHeadId } });
        const operator = await prisma.user.findUnique({ where: { id: inspection.operatorId } });
        for (const a of alertsToFire) {
          fireCriticalAlert({
            type: a.reason === "fail" ? "critical_fail" : "threshold_exceeded",
            beltHeadCode: beltHead?.code ?? "?",
            checklistLabel: a.item.labelTh,
            operatorName: operator?.fullName ?? "?",
            detail:
              a.reason === "fail"
                ? a.r.noteText ?? "ตรวจพบ Fail"
                : `ค่าที่บันทึก ${a.r.numericValue} ${a.item.unit ?? ""} (เกณฑ์ ${a.item.thresholdMin ?? "-"} ถึง ${a.item.thresholdMax ?? "-"})`,
            inspectionId: inspection.id,
          }).catch((e) => console.error("fireCriticalAlert failed", e));
        }
      }

      res.json({
        saved: savedResults.length,
        alertsTriggered: alertsToFire.length,
        results: savedResults.map((r) => ({ id: r.id, checklistItemId: r.checklistItemId })),
      });
    } catch (err) {
      next(err);
    }
  }
);

inspectionsRouter.post("/:id/submit", requireRole("operator", "engineer", "admin"), async (req, res, next) => {
  try {
    const inspection = await prisma.inspection.update({
      where: { id: req.params.id },
      data: { status: "submitted", submittedAt: new Date() },
    });
    await writeAuditLog({
      actorUserId: req.user!.sub,
      action: "inspection_submit",
      targetType: "inspection",
      targetId: inspection.id,
      req,
    });
    res.json(inspection);
  } catch (err) {
    next(err);
  }
});

// ---- Offline sync batch ----
const syncItemSchema = z.object({
  idempotencyKey: z.string().min(1),
  beltHeadCode: z.string().min(1),
  shiftName: z.enum(["day", "night"]).optional(),
  deviceId: z.string().optional(),
  clientSubmittedAt: z.string().datetime(),
  gps: gpsSchema,
  results: z.array(resultItemSchema),
});

const syncBatchSchema = z.object({ items: z.array(syncItemSchema).min(1).max(50) });

/**
 * รับข้อมูลจาก offline queue ของมือถือเมื่อกลับมาออนไลน์
 * - ตรวจ geofence ซ้ำจากพิกัดที่บันทึกไว้ตอน offline (เป็นข้อจำกัดโดยธรรมชาติของ offline mode
 *   ดูรายละเอียดใน docs/GPS_SPOOFING_AND_MDM.md)
 * - idempotencyKey ป้องกันข้อมูลซ้ำเมื่อ sync ถูกเรียกซ้ำ (retry จาก client)
 */
inspectionsRouter.post("/sync-batch", requireRole("operator", "engineer", "admin"), async (req, res, next) => {
  try {
    const { items } = syncBatchSchema.parse(req.body);
    const results: Array<{ idempotencyKey: string; status: string; error?: string }> = [];

    for (const item of items) {
      try {
        const existing = await prisma.inspection.findUnique({ where: { idempotencyKey: item.idempotencyKey } });
        if (existing) {
          results.push({ idempotencyKey: item.idempotencyKey, status: "already_synced" });
          continue;
        }

        const beltHead = await prisma.beltHead.findUnique({ where: { code: item.beltHeadCode } });
        if (!beltHead) {
          results.push({ idempotencyKey: item.idempotencyKey, status: "rejected", error: "belt_head_not_found" });
          continue;
        }

        const { result: geoResult } = await reverifyGeofenceOrThrow(beltHead.id, item.gps).catch((e) => {
          throw e;
        });

        const inspection = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          const insp = await tx.inspection.create({
            data: {
              beltHeadId: beltHead.id,
              operatorId: req.user!.sub,
              shiftName: item.shiftName,
              checkInLat: item.gps.latitude,
              checkInLng: item.gps.longitude,
              checkInAccuracyM: item.gps.accuracyM,
              geofenceCheckPassed: true,
              geofenceDistanceM: geoResult.distanceM,
              deviceId: item.deviceId,
              idempotencyKey: item.idempotencyKey,
              clientSubmittedAt: new Date(item.clientSubmittedAt),
              syncSource: "offline_sync",
              status: "synced",
              submittedAt: new Date(),
            },
          });

          const checklistItems = await tx.checklistItemDef.findMany({
            where: { id: { in: item.results.map((r) => r.checklistItemId) } },
          });
          const itemsById = new Map(checklistItems.map((i) => [i.id, i]));

          for (const r of item.results) {
            const def = itemsById.get(r.checklistItemId);
            if (!def) continue;
            let thresholdBreached = false;
            if (def.inputType === "numeric" && r.numericValue !== undefined) {
              const min = def.thresholdMin !== null ? Number(def.thresholdMin) : null;
              const max = def.thresholdMax !== null ? Number(def.thresholdMax) : null;
              if ((min !== null && r.numericValue < min) || (max !== null && r.numericValue > max)) {
                thresholdBreached = true;
              }
            }
            await tx.inspectionResult.create({
              data: {
                inspectionId: insp.id,
                checklistItemId: def.id,
                resultValue: r.resultValue,
                numericValue: r.numericValue,
                thresholdBreached,
                noteText: r.noteText,
                voiceTranscript: r.voiceTranscript,
              },
            });
          }

          return insp;
        });

        await writeAuditLog({
          actorUserId: req.user!.sub,
          action: "inspection_sync",
          targetType: "inspection",
          targetId: inspection.id,
          req,
          metadata: { idempotencyKey: item.idempotencyKey, source: "offline_sync" },
        });

        results.push({ idempotencyKey: item.idempotencyKey, status: "synced" });
      } catch (e: any) {
        results.push({
          idempotencyKey: item.idempotencyKey,
          status: "rejected",
          error: e instanceof HttpError ? e.message : String(e?.message ?? e),
        });
      }
    }

    res.json({ results });
  } catch (err) {
    next(err);
  }
});

inspectionsRouter.get("/", requireRole("engineer", "admin"), async (req, res, next) => {
  try {
    const { beltHeadCode, status, from, to } = req.query as Record<string, string | undefined>;
    const where: Prisma.InspectionWhereInput = {};
    if (beltHeadCode) where.beltHead = { code: beltHeadCode };
    if (status) where.status = status as any;
    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as any).gte = new Date(from);
      if (to) (where.createdAt as any).lte = new Date(to);
    }

    const inspections = await prisma.inspection.findMany({
      where,
      include: { beltHead: true, operator: { select: { fullName: true, employeeCode: true } }, results: { include: { checklistItem: true, photos: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json(inspections);
  } catch (err) {
    next(err);
  }
});

inspectionsRouter.get("/:id", async (req, res, next) => {
  try {
    const inspection = await prisma.inspection.findUnique({
      where: { id: req.params.id },
      include: { beltHead: true, operator: { select: { fullName: true, employeeCode: true } }, results: { include: { checklistItem: true, photos: true } } },
    });
    if (!inspection) throw new HttpError(404, "inspection_not_found");
    if (req.user!.role === "operator" && inspection.operatorId !== req.user!.sub) {
      throw new HttpError(403, "not_inspection_owner");
    }
    res.json(inspection);
  } catch (err) {
    next(err);
  }
});
