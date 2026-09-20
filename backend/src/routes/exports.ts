import { Router } from "express";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { writeAuditLog } from "../lib/audit";

export const exportsRouter = Router();

exportsRouter.use(requireAuth, requireRole("engineer", "admin"));

async function fetchInspectionsForExport(query: Record<string, string | undefined>) {
  const { beltHeadCode, from, to } = query;
  const where: any = {};
  if (beltHeadCode) where.beltHead = { code: beltHeadCode };
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = new Date(from);
    if (to) where.createdAt.lte = new Date(to);
  }
  return prisma.inspection.findMany({
    where,
    include: {
      beltHead: true,
      operator: { select: { fullName: true, employeeCode: true } },
      results: { include: { checklistItem: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });
}

exportsRouter.get("/inspections.xlsx", async (req, res, next) => {
  try {
    const inspections = await fetchInspectionsForExport(req.query as Record<string, string | undefined>);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Inspections");
    sheet.columns = [
      { header: "Inspection ID", key: "id", width: 36 },
      { header: "Belt Head", key: "beltHead", width: 12 },
      { header: "Operator", key: "operator", width: 20 },
      { header: "Shift", key: "shift", width: 10 },
      { header: "Started At", key: "startedAt", width: 22 },
      { header: "Submitted At", key: "submittedAt", width: 22 },
      { header: "Status", key: "status", width: 14 },
      { header: "Geofence Distance (m)", key: "distance", width: 18 },
      { header: "Checklist Item", key: "item", width: 28 },
      { header: "Result", key: "result", width: 10 },
      { header: "Numeric Value", key: "numeric", width: 14 },
      { header: "Threshold Breached", key: "breached", width: 16 },
      { header: "Note", key: "note", width: 30 },
    ];

    for (const insp of inspections) {
      if (insp.results.length === 0) {
        sheet.addRow({
          id: insp.id,
          beltHead: insp.beltHead.code,
          operator: insp.operator.fullName,
          shift: insp.shiftName,
          startedAt: insp.startedAt,
          submittedAt: insp.submittedAt,
          status: insp.status,
          distance: Number(insp.geofenceDistanceM),
        });
        continue;
      }
      for (const r of insp.results) {
        sheet.addRow({
          id: insp.id,
          beltHead: insp.beltHead.code,
          operator: insp.operator.fullName,
          shift: insp.shiftName,
          startedAt: insp.startedAt,
          submittedAt: insp.submittedAt,
          status: insp.status,
          distance: Number(insp.geofenceDistanceM),
          item: r.checklistItem.labelTh,
          result: r.resultValue,
          numeric: r.numericValue ? Number(r.numericValue) : "",
          breached: r.thresholdBreached ? "YES" : "",
          note: r.noteText ?? "",
        });
      }
    }
    sheet.getRow(1).font = { bold: true };

    await writeAuditLog({ actorUserId: req.user!.sub, action: "export_download", req, metadata: { format: "xlsx" } });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=inspections.xlsx");
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});

exportsRouter.get("/inspections.pdf", async (req, res, next) => {
  try {
    const inspections = await fetchInspectionsForExport(req.query as Record<string, string | undefined>);

    await writeAuditLog({ actorUserId: req.user!.sub, action: "export_download", req, metadata: { format: "pdf" } });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=inspections.pdf");

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    doc.pipe(res);

    doc.fontSize(16).text("Hongsa Belt Inspection Report", { align: "center" });
    doc.moveDown();
    doc.fontSize(9).fillColor("#555").text(`Generated: ${new Date().toISOString()}`, { align: "center" });
    doc.moveDown(1.5);

    for (const insp of inspections) {
      doc
        .fillColor("#000")
        .fontSize(12)
        .text(`${insp.beltHead.code} — ${insp.status.toUpperCase()} — ${insp.operator.fullName}`, {
          underline: true,
        });
      doc
        .fontSize(9)
        .fillColor("#333")
        .text(
          `Started: ${insp.startedAt.toISOString()}  Submitted: ${insp.submittedAt?.toISOString() ?? "-"}  Distance: ${Number(
            insp.geofenceDistanceM
          ).toFixed(1)}m`
        );
      doc.moveDown(0.3);

      for (const r of insp.results) {
        const flag = r.resultValue === "fail" ? " [FAIL]" : r.thresholdBreached ? " [THRESHOLD]" : "";
        doc
          .fontSize(9)
          .fillColor(r.resultValue === "fail" || r.thresholdBreached ? "#b00020" : "#111")
          .text(
            `  - ${r.checklistItem.labelTh}: ${r.resultValue ?? ""}${
              r.numericValue !== null ? " " + Number(r.numericValue) : ""
            }${flag}${r.noteText ? " — " + r.noteText : ""}`
          );
      }
      doc.moveDown(1);
      if (doc.y > 720) doc.addPage();
    }

    doc.end();
  } catch (err) {
    next(err);
  }
});
