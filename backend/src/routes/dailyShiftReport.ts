import { Router } from "express";
import path from "path";
import PDFDocument from "pdfkit";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { writeAuditLog } from "../lib/audit";

// รายงานสรุปผลตรวจเช็คสายพานประจำวัน แบ่ง 2 กะ (เช้า 07:00–19:00 / ดึก 19:00–07:00)
// แสดงสถานะรายชั่วโมงของทุกหัวสายพานแบบ heatmap พร้อมช่องเซ็นรับรอง — ออกแบบไว้พิมพ์เป็นกระดาษ
// เวลาทั้งหมดอ้างอิงโซนเวลาลาว/ไทย UTC+7 (ไม่มี DST จึงใช้ offset คงที่ได้อย่างปลอดภัย)

const LAOS_OFFSET_HOURS = 7;
const DAY_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
const NIGHT_HOURS = [19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6];

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

const STATUS_COLOR: Record<string, string> = {
  pass: "#0ca30c",
  warn: "#fab219",
  fail: "#d03b3b",
  none: "#c3c2b7",
};
const STATUS_LABEL: Record<string, string> = {
  pass: "ปกติ (Ready)",
  warn: "เกินเกณฑ์ (Warning)",
  fail: "Fail (Down)",
  none: "ไม่มีข้อมูล",
};

function localHourToUtcOffset(h: number): number {
  return (h - LAOS_OFFSET_HOURS + 24) % 24;
}

function formatThaiDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const buddhistYear = y + 543;
  return `${d} ${THAI_MONTHS[m - 1]} ${buddhistYear}`;
}

export const dailyShiftReportRouter = Router();

dailyShiftReportRouter.get(
  "/daily-shift-report.pdf",
  requireAuth,
  requireRole("engineer", "admin"),
  async (req, res, next) => {
    try {
      const dateParam = typeof req.query.date === "string" ? req.query.date : undefined;
      const nowLaos = new Date(Date.now() + LAOS_OFFSET_HOURS * 3600 * 1000);
      const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : nowLaos.toISOString().slice(0, 10);

      const utcDayStart = new Date(`${date}T00:00:00.000Z`);
      const utcDayEnd = new Date(utcDayStart.getTime() + 24 * 3600 * 1000);

      const [beltHeads, inspections] = await Promise.all([
        prisma.beltHead.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
        prisma.inspection.findMany({
          where: { createdAt: { gte: utcDayStart, lt: utcDayEnd } },
          include: { results: true, beltHead: true },
          orderBy: { createdAt: "asc" },
        }),
      ]);

      // จัดกลุ่มเป็น map[beltHeadId][hourOffset(0-23 UTC)] = สถานะล่าสุดของชั่วโมงนั้น
      const byBeltHour = new Map<string, Map<number, string>>();
      for (const insp of inspections) {
        const hourOffset = Math.floor((insp.createdAt.getTime() - utcDayStart.getTime()) / 3600000);
        let status = "pass";
        if (insp.results.some((r) => r.resultValue === "fail")) status = "fail";
        else if (insp.results.some((r) => r.thresholdBreached)) status = "warn";
        if (!byBeltHour.has(insp.beltHeadId)) byBeltHour.set(insp.beltHeadId, new Map());
        byBeltHour.get(insp.beltHeadId)!.set(hourOffset, status);
      }

      let pass = 0, fail = 0, warn = 0, none = 0;
      for (const bh of beltHeads) {
        for (const h of [...DAY_HOURS, ...NIGHT_HOURS]) {
          const s = byBeltHour.get(bh.id)?.get(localHourToUtcOffset(h)) ?? "none";
          if (s === "pass") pass++;
          else if (s === "fail") fail++;
          else if (s === "warn") warn++;
          else none++;
        }
      }
      const total = pass + fail + warn + none;
      const passRate = total > 0 ? Math.round((pass / (total - none || 1)) * 100) : 0;

      await writeAuditLog({
        actorUserId: req.user!.sub,
        action: "export_download",
        req,
        metadata: { format: "pdf", type: "daily-shift-report", date },
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=daily-shift-report-${date}.pdf`);

      const doc = new PDFDocument({ margin: 36, size: "A4" });
      doc.pipe(res);

      const fontDir = path.join(__dirname, "../../assets/fonts");
      doc.registerFont("Thai", path.join(fontDir, "Garuda.ttf"));
      doc.registerFont("ThaiBold", path.join(fontDir, "Garuda-Bold.ttf"));

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const left = doc.page.margins.left;

      doc.font("ThaiBold").fontSize(16).fillColor("#0b0b0b").text("รายงานสรุปผลตรวจเช็คสายพานลำเลียงประจำวัน", { align: "center" });
      doc.font("Thai").fontSize(10).fillColor("#52514e").text("โครงการเหมืองหงสา สปป.ลาว", { align: "center" });
      doc.fontSize(10).text(`วันที่ ${formatThaiDate(date)}  (กะเช้า 07:00–19:00 น. และกะดึก 19:00–07:00 น.)`, { align: "center" });
      doc.moveDown(1);

      // แถวสรุปตัวเลขหลัก
      const kpis = [
        { label: "รอบตรวจทั้งหมด", value: String(total - none) },
        { label: "อัตราปกติ (Ready)", value: `${passRate}%` },
        { label: "Fail", value: String(fail) },
        { label: "Warning", value: String(warn) },
      ];
      const kpiW = pageWidth / 4;
      const kpiY = doc.y;
      kpis.forEach((k, i) => {
        const x = left + i * kpiW;
        doc.roundedRect(x + 4, kpiY, kpiW - 8, 44, 4).fillAndStroke("#f1efe8", "#e1e0d9");
        doc.font("Thai").fontSize(8).fillColor("#52514e").text(k.label, x + 10, kpiY + 8, { width: kpiW - 20 });
        doc.font("ThaiBold").fontSize(15).fillColor("#0b0b0b").text(k.value, x + 10, kpiY + 22, { width: kpiW - 20 });
      });
      doc.y = kpiY + 56;
      doc.moveDown(0.5);

      function drawShiftGrid(shiftLabel: string, hours: number[]) {
        doc.font("ThaiBold").fontSize(11).fillColor("#0b0b0b").text(shiftLabel, left, doc.y);
        doc.moveDown(0.3);

        const labelColW = 46;
        const cellW = (pageWidth - labelColW) / hours.length;
        const cellH = 13;
        const startY = doc.y + 12;

        // หัวคอลัมน์ชั่วโมง
        doc.font("Thai").fontSize(7).fillColor("#898781");
        hours.forEach((h, i) => {
          doc.text(String(h).padStart(2, "0"), left + labelColW + i * cellW, startY - 11, { width: cellW, align: "center" });
        });

        beltHeads.forEach((bh, rowIdx) => {
          const y = startY + rowIdx * (cellH + 2);
          doc.font("ThaiBold").fontSize(8).fillColor("#0b0b0b").text(bh.code, left, y + 2, { width: labelColW - 4 });
          hours.forEach((h, colIdx) => {
            const status = byBeltHour.get(bh.id)?.get(localHourToUtcOffset(h)) ?? "none";
            const x = left + labelColW + colIdx * cellW;
            doc.rect(x + 1, y, cellW - 2, cellH).fill(STATUS_COLOR[status]);
          });
        });

        doc.y = startY + beltHeads.length * (cellH + 2) + 8;
      }

      drawShiftGrid("กะเช้า (Day shift) 07:00–19:00 น.", DAY_HOURS);
      drawShiftGrid("กะดึก (Night shift) 19:00–07:00 น.", NIGHT_HOURS);

      // คำอธิบายสี
      doc.moveDown(0.3);
      let lx = left;
      const ly = doc.y;
      Object.entries(STATUS_LABEL).forEach(([key, label]) => {
        doc.rect(lx, ly + 1, 8, 8).fill(STATUS_COLOR[key]);
        doc.font("Thai").fontSize(8).fillColor("#52514e").text(label, lx + 12, ly, { width: 110 });
        lx += 122;
      });
      doc.y = ly + 24;

      // ช่องลงชื่อรับรอง
      doc.moveDown(1.5);
      const sigY = doc.y;
      const sigColW = pageWidth / 2;
      const sigLines = [
        { title: "ผู้ตรวจสอบ (Operator)", x: left },
        { title: "ผู้รับรองผล (Engineer)", x: left + sigColW },
      ];
      sigLines.forEach((s) => {
        doc.moveTo(s.x + 10, sigY + 28).lineTo(s.x + sigColW - 20, sigY + 28).strokeColor("#898781").stroke();
        doc.font("Thai").fontSize(9).fillColor("#0b0b0b").text("ลงชื่อ ...................................................", s.x + 10, sigY, { width: sigColW - 30 });
        doc.text(s.title, s.x + 10, sigY + 32, { width: sigColW - 30 });
        doc.text("วันที่ ............/............/............", s.x + 10, sigY + 46, { width: sigColW - 30 });
      });

      doc.end();
    } catch (err) {
      next(err);
    }
  }
);
