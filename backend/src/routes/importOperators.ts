import { Router } from "express";
import argon2 from "argon2";
import { prisma } from "../lib/prisma";

// นำเข้ารายชื่อพนักงานควบคุมสายพาน (Operator) แบบครั้งเดียว จากทะเบียนพนักงานท้องถิ่น (LAO) แผนกสายพาน
// กรองแล้วเฉพาะคนที่ตำแหน่ง "พนักงานควบคุมระบบสายพาน" และยังไม่ลาออก (เทียบกับชีตรายชื่อพนักงานที่ลาออกแล้ว)
// ป้องกันด้วย IMPORT_TOKEN (env var) — ถ้าไม่ตั้งค่า route นี้จะปิดใช้งานเสมอ
// ปลอดภัยเรียกซ้ำได้ — ใช้ upsert แบบ "สร้างถ้ายังไม่มี" เท่านั้น ไม่ทับข้อมูล user ที่มีอยู่แล้ว

const OPERATORS: { employeeCode: string; fullName: string }[] = [
  { employeeCode: "5LD00238", fullName: "นางบุนมี จันทะวอน" },
  { employeeCode: "5LD00239", fullName: "นางสม สิดทิโวหาน" },
  { employeeCode: "5LD00521", fullName: "ท้าวจานที บุนมี" },
  { employeeCode: "5LD00536", fullName: "นางจันที สิดทิโวหาน" },
  { employeeCode: "5LD00553", fullName: "นางสี พันทุลัก" },
  { employeeCode: "5LD00690", fullName: "นางสี ไชวุดทิ" },
  { employeeCode: "5LD00798", fullName: "นางบัวแปน พันทะมิด" },
  { employeeCode: "5LD01439", fullName: "นางสูน" },
  { employeeCode: "5LD01558", fullName: "นางคำไบ แปงแสงแก้ว" },
  { employeeCode: "5LD01807", fullName: "ท้าวทองใบ ขุนอาสา" },
  { employeeCode: "5LD01939", fullName: "ท้าวอานุสัก สีวันไช" },
  { employeeCode: "5LD01965", fullName: "ท้าวเงิน แก้วพิลา" },
  { employeeCode: "5LD02028", fullName: "ท้าวลือไช" },
  { employeeCode: "5LD02041", fullName: "ท้าวกองคำ พอนสะหวัด" },
  { employeeCode: "5LD02067", fullName: "ท้าวน้อย วงวิจิด" },
  { employeeCode: "5LD02069", fullName: "ท้าวเงิน จันทะวง" },
  { employeeCode: "5LD02072", fullName: "ท้าวติด อินปันยา" },
  { employeeCode: "5LD02116", fullName: "ท้าวสุลิน สุกถาวอน" },
  { employeeCode: "5LD02150", fullName: "ท้าวสุนี มาลาสอน" },
  { employeeCode: "5LD02153", fullName: "ท้าวหุมพัน บุนสะหมอน" },
  { employeeCode: "5LD02183", fullName: "ท้าวสายฟ้า ส้อยไชยะ" },
  { employeeCode: "5LD02216", fullName: "ท้าวเสิด ไชมูน" },
  { employeeCode: "5LD02223", fullName: "ท้าวคำหล้า วิไลจิด" },
  { employeeCode: "5LD02235", fullName: "ท้าวทองสี สีเมือง" },
  { employeeCode: "5LD02247", fullName: "ท้าวสุพิน สุกถาวอน" },
  { employeeCode: "5LD02272", fullName: "ท้าวสาทิด แสงทองคำ" },
  { employeeCode: "5LD02288", fullName: "ท้าวสินทอน หงวิไช" },
  { employeeCode: "5LD02294", fullName: "ท้าวคำมด ลีมูนแก้ว" },
  { employeeCode: "5LD02301", fullName: "ท้าวบุนยัง สะกุนทอง" },
  { employeeCode: "5LD02334", fullName: "ท้าวหล้าลุบ วงแสงแก้ว" },
  { employeeCode: "5LD02339", fullName: "ท้าวสมอก จะเลินสัก" },
  { employeeCode: "5LD02341", fullName: "ท้าวมอดดี้ เพ็ดกิดา" },
  { employeeCode: "5LD02353", fullName: "ท้าวฟิด พันทุลัก" },
  { employeeCode: "5LD02379", fullName: "ท้าวกันไช สุกสมบัด" },
  { employeeCode: "5LD02386", fullName: "ท้าวสอนเพ็ด จิดทะวง" },
  { employeeCode: "5LD02417", fullName: "ท้าวสิด วงวิจิด" },
  { employeeCode: "5LD02464", fullName: "ท้าวสุกสะหวัน ไชยะวง" },
  { employeeCode: "5LD02521", fullName: "ท้าวทองเคียน แสงทองคำ" },
  { employeeCode: "5LD02522", fullName: "ท้าวส้อย ทิดวงคำ" },
  { employeeCode: "5LD02523", fullName: "ท้าวแลมโบ สะกุนทอง" },
  { employeeCode: "5LD02526", fullName: "ท้าวขึม สับหมั้น" },
];

export const importOperatorsRouter = Router();

importOperatorsRouter.get("/", async (req, res, next) => {
  try {
    const configuredToken = process.env.IMPORT_TOKEN;
    if (!configuredToken) {
      return res.status(404).json({ error: "Not found" });
    }
    const providedToken = req.query.token;
    if (typeof providedToken !== "string" || providedToken !== configuredToken) {
      return res.status(403).json({ error: "Invalid or missing token" });
    }

    const pinHash = await argon2.hash("0000", { type: argon2.argon2id });

    let created = 0;
    let alreadyExisted = 0;
    const createdList: string[] = [];

    for (const op of OPERATORS) {
      const existing = await prisma.user.findUnique({ where: { employeeCode: op.employeeCode } });
      if (existing) {
        alreadyExisted++;
        continue;
      }
      await prisma.user.create({
        data: {
          employeeCode: op.employeeCode,
          fullName: op.fullName,
          role: "operator",
          pinHash,
        },
      });
      created++;
      createdList.push(op.employeeCode);
    }

    res.json({
      ok: true,
      message: "Import operators complete. PIN เริ่มต้นของทุกคนคือ 0000 — แนะนำให้เปลี่ยนก่อนใช้งานจริง",
      totalInList: OPERATORS.length,
      created,
      alreadyExisted,
      createdCodes: createdList,
    });
  } catch (err) {
    next(err);
  }
});
