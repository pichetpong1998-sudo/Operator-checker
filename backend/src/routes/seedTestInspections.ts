import { Router } from "express";
import crypto from "crypto";
import argon2 from "argon2";
import { prisma } from "../lib/prisma";

// สร้างข้อมูลตรวจ (Inspection) จำลองแบบครั้งเดียวผ่าน URL — สำหรับทดสอบโหลดจริง
// (เช่น "11 หัวสายพาน x ตรวจทุกชั่วโมง") ก่อนใช้งานจริง โดยไม่ต้องมี Shell access
// ใช้ operator บัญชีทดสอบเฉพาะ (TESTSIM) แยกจากบัญชีจริงทั้งหมด เพื่อให้ลบข้อมูลทดสอบทิ้งได้ง่ายด้วย ?clear=1
// ป้องกันด้วย IMPORT_TOKEN (env var เดียวกับ import operators) — ปลอดภัยเรียกซ้ำได้ (deterministic id + skipDuplicates)

const TEST_OPERATOR_CODE = "TESTSIM";

function stableId(...parts: string[]): string {
  const hash = crypto.createHash("sha256").update(parts.join("|")).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${(
    (parseInt(hash[16], 16) & 0x3) |
    0x8
  ).toString(16)}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export const seedTestInspectionsRouter = Router();

seedTestInspectionsRouter.get("/", async (req, res, next) => {
  try {
    const configuredToken = process.env.IMPORT_TOKEN;
    if (!configuredToken) {
      return res.status(404).json({ error: "Not found" });
    }
    const providedToken = req.query.token;
    if (typeof providedToken !== "string" || providedToken !== configuredToken) {
      return res.status(403).json({ error: "Invalid or missing token" });
    }

    const testOperatorId = stableId("test-operator", TEST_OPERATOR_CODE);
    const existingOperator = await prisma.user.findUnique({ where: { employeeCode: TEST_OPERATOR_CODE } });
    if (!existingOperator) {
      const pinHash = await argon2.hash("0000", { type: argon2.argon2id });
      await prisma.user.create({
        data: {
          id: testOperatorId,
          employeeCode: TEST_OPERATOR_CODE,
          fullName: "ข้อมูลทดสอบระบบ (ลบได้ — ไม่ใช่พนักงานจริง)",
          role: "operator",
          pinHash,
        },
      });
    }
    const operatorId = existingOperator?.id ?? testOperatorId;

    // ?clear=1 → ลบข้อมูลทดสอบทั้งหมดทิ้ง (InspectionResult ลบตามด้วย cascade)
    if (req.query.clear === "1") {
      const del = await prisma.inspection.deleteMany({ where: { operatorId } });
      return res.json({ ok: true, cleared: true, deletedInspections: del.count });
    }

    const daysParam = Number(req.query.days);
    const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(Math.floor(daysParam), 14) : 3;
    const hours = days * 24;

    const [beltHeads, geofences, checklistItems] = await Promise.all([
      prisma.beltHead.findMany({ where: { active: true } }),
      prisma.geofence.findMany(),
      prisma.checklistItemDef.findMany({ where: { active: true } }),
    ]);
    const geofenceByBeltHead = new Map(geofences.map((g) => [g.beltHeadId, g]));

    const now = new Date();
    now.setMinutes(0, 0, 0);

    const inspectionRows: any[] = [];
    const resultRows: any[] = [];

    for (const bh of beltHeads) {
      const gf = geofenceByBeltHead.get(bh.id);
      const baseLat = gf ? Number(gf.latitude) : 19.91;
      const baseLng = gf ? Number(gf.longitude) : 101.25;
      const jitter = () => (Math.random() - 0.5) * 0.0003;

      for (let h = 0; h < hours; h++) {
        const ts = new Date(now.getTime() - h * 60 * 60 * 1000);
        const inspectionId = stableId("test-inspection", bh.code, ts.toISOString());
        const hourOfDay = ts.getHours();
        const shiftName = hourOfDay >= 6 && hourOfDay < 18 ? "day" : "night";

        inspectionRows.push({
          id: inspectionId,
          beltHeadId: bh.id,
          operatorId,
          shiftName,
          startedAt: ts,
          submittedAt: ts,
          clientSubmittedAt: ts,
          checkInLat: baseLat + jitter(),
          checkInLng: baseLng + jitter(),
          checkInAccuracyM: 5 + Math.random() * 10,
          geofenceCheckPassed: true,
          geofenceDistanceM: Math.random() * 15,
          status: "submitted" as const,
          syncSource: "web" as const,
          deviceId: "test-simulator",
          idempotencyKey: `test-seed-${bh.code}-${ts.toISOString()}`,
          createdAt: ts,
        });

        for (const item of checklistItems) {
          let resultValue: "pass" | "fail" | "na" | null = null;
          let numericValue: number | null = null;
          let thresholdBreached = false;

          if (item.inputType === "numeric") {
            const min = item.thresholdMin !== null ? Number(item.thresholdMin) : 0;
            const max = item.thresholdMax !== null ? Number(item.thresholdMax) : 100;
            const breach = Math.random() < 0.08; // ~8% จำลองค่าออกนอกเกณฑ์ ให้เห็นสถานะ warning บน dashboard
            if (breach) {
              numericValue = Math.max(0, min - (2 + Math.random() * 15));
            } else {
              const lo = min + (max - min) * 0.15;
              const hi = max - (max - min) * 0.05;
              numericValue = lo + Math.random() * (hi - lo);
            }
            numericValue = Math.round(numericValue * 10) / 10;
            thresholdBreached =
              (item.thresholdMin !== null && numericValue < Number(item.thresholdMin)) ||
              (item.thresholdMax !== null && numericValue > Number(item.thresholdMax));
          } else {
            const roll = Math.random();
            resultValue = roll < 0.9 ? "pass" : roll < 0.97 ? "fail" : "na"; // ~90% pass, 7% fail, 3% na
          }

          resultRows.push({
            id: stableId("test-result", inspectionId, item.code),
            inspectionId,
            checklistItemId: item.id,
            resultValue,
            numericValue,
            thresholdBreached,
            createdAt: ts,
          });
        }
      }
    }

    let inspectionsCreated = 0;
    for (const batch of chunk(inspectionRows, 1000)) {
      const r = await prisma.inspection.createMany({ data: batch, skipDuplicates: true });
      inspectionsCreated += r.count;
    }

    let resultsCreated = 0;
    for (const batch of chunk(resultRows, 2000)) {
      const r = await prisma.inspectionResult.createMany({ data: batch, skipDuplicates: true });
      resultsCreated += r.count;
    }

    res.json({
      ok: true,
      testOperatorCode: TEST_OPERATOR_CODE,
      days,
      beltHeadsUsed: beltHeads.length,
      hoursPerBeltHead: hours,
      inspectionsAttempted: inspectionRows.length,
      inspectionsCreated,
      resultsAttempted: resultRows.length,
      resultsCreated,
      note: "เรียกซ้ำได้ ข้อมูลเดิมจะไม่ซ้ำ (idempotent) — ลบข้อมูลทดสอบทั้งหมดด้วย &clear=1",
    });
  } catch (err) {
    next(err);
  }
});
