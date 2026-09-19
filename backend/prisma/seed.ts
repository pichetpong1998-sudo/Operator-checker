import "dotenv/config";
import { PrismaClient, ChecklistCategory, ChecklistInputType } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

// หัวสายพานทั้งหมดที่ต้องรองรับ
const BELT_HEADS = ["S2C", "S2B", "S2A", "S2", "S3", "S5", "B1", "B2", "B3", "C1", "C2"];

// พิกัดตัวอย่างสำหรับทดสอบ (ศูนย์กลางโครงการเหมืองหงสาโดยประมาณ) — ต้องแก้เป็นพิกัดจริงผ่านหน้า Admin ก่อนใช้งานจริง
const SAMPLE_CENTER = { lat: 19.9100, lng: 101.2500 };

function jitterCoord(base: number, index: number) {
  return base + index * 0.0015; // กระจายพิกัดตัวอย่างให้ไม่ซ้อนกันสำหรับ demo/test เท่านั้น
}

const DRIVE_UNITS = [1, 2, 3, 4];

async function buildChecklistItems() {
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

async function main() {
  console.log("Seeding belt heads + geofences...");
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
  }

  console.log("Seeding checklist item definitions...");
  const items = await buildChecklistItems();
  for (const item of items) {
    await prisma.checklistItemDef.upsert({
      where: { code: item.code },
      update: {},
      create: item,
    });
  }

  console.log("Seeding sample users (CHANGE THESE PINS BEFORE PRODUCTION USE)...");
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
  }

  console.log("Seed complete.");
  console.log("Sample login (TEST DATA ONLY, rotate before production):");
  for (const u of sampleUsers) {
    console.log(`  ${u.role}: employeeCode=${u.employeeCode} pin=${u.pin}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
