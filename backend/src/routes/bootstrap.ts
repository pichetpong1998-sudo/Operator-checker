import { Router } from "express";
import argon2 from "argon2";
import { PrismaClient, ChecklistCategory, ChecklistInputType } from "@prisma/client";
import { env } from "../config/env";

// เส้นทางนี้ไว้สำหรับสร้างข้อมูลเริ่มต้น (หัวสายพาน 11 จุด + checklist 18 ข้อ + user ทดสอบ 3 role)
// โดยไม่ต้องพึ่ง Shell access — จำเป็นสำหรับ deploy บน plan free ของ Render ซึ่งไม่มี Shell tab
// ป้องกันด้วย BOOTSTRAP_TOKEN (ตั้งใน environment variable, สุ่มโดย Render) — ถ้าไม่ตั้งค่า route นี้จะปิดใช้งานเสมอ
// เรียกใช้แค่ครั้งเดียวตอน deploy ครั้งแรกก็พอ (เรียกซ้ำได้ปลอดภัย ไม่ทับข้อมูลที่มีอยู่แล้ว — ใช้ upsert แบบ "สร้างถ้ายังไม่มี" เท่านั้น)

const prisma = new PrismaClient();

const BELT_HEADS = ["S2C", "S2B", "S2A", "S2", "S3", "S5", "B1", "B2", "B3", "C1", "C2"];
const SAMPLE_CENTER = { lat: 19.91, lng: 101.25 };
function jitterCoord(base: number, index: number) {
  return base + index * 0.0015;
}
const DRIVE_UNITS = [1, 2, 3, 4];

function buildChecklistItems() {
  const items: Array<{
    code: string;
    category: ChecklistCategory;
    labelTh: string;
    labelEn: string;
    inputType: ChecklistInputType;
    unit?: string;
    thresholdMin?: number;
    thresholdMax?: number;
    sortOrder: number;
  }> = [];

  let sort = 0;
  for (const d of DRIVE_UNITS) {
    items.push({
      code: `DRIVE_${d}_OIL_LEVEL`,
      category: `drive_unit_${d}` as ChecklistCategory,
      labelTh: `Drive Unit ${d}: ระดับน้ำมันเกียร์`,
      labelEn: `Drive Unit ${d}: Gear Oil Level`,
      inputType: "numeric",
      unit: "%",
      thresholdMin: 60,
      thresholdMax: 100,
      sortOrder: sort++,
    });
    items.push({
      code: `DRIVE_${d}_VISUAL_CHECK`,
      category: `drive_unit_${d}` as ChecklistCategory,
      labelTh: `Drive Unit ${d}: Visual Check (เสียง/สภาพภายนอก/กลิ่น)`,
      labelEn: `Drive Unit ${d}: Visual Check (noise/condition/smell)`,
      inputType: "pass_fail_na",
      sortOrder: sort++,
    });
  }

  items.push(
    { code: "BELT_CLEANER_PRIMARY", category: "belt_cleaner_primary", labelTh: "Belt Cleaner Primary", labelEn: "Belt Cleaner Primary", inputType: "pass_fail_na", sortOrder: sort++ },
    { code: "BELT_CLEANER_SECONDARY", category: "belt_cleaner_secondary", labelTh: "Belt Cleaner Secondary", labelEn: "Belt Cleaner Secondary", inputType: "pass_fail_na", sortOrder: sort++ },
    { code: "IMPACT_CARRY_RETURN", category: "impact_carry_return", labelTh: "Impact Carry Return", labelEn: "Impact Carry Return", inputType: "pass_fail_na", sortOrder: sort++ },
    { code: "CHUTE_DUST", category: "chute_dust", labelTh: "ฝุ่นที่ Chute", labelEn: "Dust at Chute", inputType: "pass_fail_na", sortOrder: sort++ },
    { code: "BELT_CONDITION", category: "belt_condition", labelTh: "สภาพสายพาน (ปกติหรือไม่)", labelEn: "Belt Condition", inputType: "pass_fail_na", sortOrder: sort++ },
    { code: "PULLEY_PRIMARY", category: "pulley_primary", labelTh: "Pulley Primary", labelEn: "Pulley Primary", inputType: "pass_fail_na", sortOrder: sort++ },
    { code: "PULLEY_SECONDARY", category: "pulley_secondary", labelTh: "Pulley Secondary", labelEn: "Pulley Secondary", inputType: "pass_fail_na", sortOrder: sort++ },
    { code: "PULLEY_TAKEUP", category: "pulley_takeup", labelTh: "Pulley Take-up", labelEn: "Pulley Take-up", inputType: "pass_fail_na", sortOrder: sort++ },
    { code: "PULLEY_TAIL", category: "pulley_tail", labelTh: "Pulley Tail", labelEn: "Pulley Tail", inputType: "pass_fail_na", sortOrder: sort++ },
    { code: "CROSSBAR_SPILLAGE", category: "crossbar_spillage", labelTh: "ดินที่ Cross Bar", labelEn: "Spillage at Cross Bar", inputType: "pass_fail_na", sortOrder: sort++ }
  );

  return items;
}

export const bootstrapRouter = Router();

bootstrapRouter.get("/", async (req, res, next) => {
  try {
    const configuredToken = process.env.BOOTSTRAP_TOKEN;
    if (!configuredToken) {
      return res.status(404).json({ error: "Not found" });
    }
    const providedToken = req.query.token;
    if (typeof providedToken !== "string" || providedToken !== configuredToken) {
      return res.status(403).json({ error: "Invalid or missing token" });
    }

    const summary: Record<string, number> = { beltHeads: 0, checklistItems: 0, users: 0 };

    for (let i = 0; i < BELT_HEADS.length; i++) {
      const code = BELT_HEADS[i];
      const beltHead = await prisma.beltHead.upsert({
        where: { code },
        update: {},
        create: { code, name: `หัวสายพาน ${code}` },
      });
      await prisma.geofence.upsert({
        where: { beltHeadId: beltHead.id },
        update: {},
        create: {
          beltHeadId: beltHead.id,
          latitude: jitterCoord(SAMPLE_CENTER.lat, i),
          longitude: jitterCoord(SAMPLE_CENTER.lng, i),
          radiusM: 50,
        },
      });
      summary.beltHeads++;
    }

    for (const item of buildChecklistItems()) {
      await prisma.checklistItemDef.upsert({
        where: { code: item.code },
        update: {},
        create: item,
      });
      summary.checklistItems++;
    }

    const sampleUsers = [
      { employeeCode: "ADM001", fullName: "Admin User", role: "admin" as const, pin: "192837" },
      { employeeCode: "ENG001", fullName: "Somchai Engineer", role: "engineer" as const, pin: "192837" },
      { employeeCode: "OPR001", fullName: "Somsak Operator", role: "operator" as const, pin: "192837" },
    ];
    for (const u of sampleUsers) {
      const pinHash = await argon2.hash(u.pin, { type: argon2.argon2id });
      await prisma.user.upsert({
        where: { employeeCode: u.employeeCode },
        update: {},
        create: { employeeCode: u.employeeCode, fullName: u.fullName, role: u.role, pinHash },
      });
      summary.users++;
    }

    res.json({
      ok: true,
      message: "Bootstrap complete. เปลี่ยน PIN ทันทีผ่านหน้า Admin แล้วลบ user ทดสอบทิ้งก่อนใช้งานจริง พิกัด geofence เป็นค่าตัวอย่าง ต้องแก้เป็นพิกัดจริงผ่านหน้า Admin",
      summary,
      sampleLogins: sampleUsers.map((u) => ({ role: u.role, employeeCode: u.employeeCode, pin: u.pin })),
    });
  } catch (err) {
    next(err);
  }
});
