import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { getPresignedUploadUrl, getPresignedViewUrl } from "../lib/storage";
import { HttpError } from "../middleware/errorHandler";

export const uploadsRouter = Router();

uploadsRouter.use(requireAuth);

const presignSchema = z.object({
  inspectionResultId: z.string().uuid(),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

// ขอ presigned URL เพื่ออัปโหลดรูปตรงไป object storage (ไม่ผ่าน backend, ประหยัด bandwidth)
uploadsRouter.post("/presign", requireRole("operator", "engineer", "admin"), async (req, res, next) => {
  try {
    const data = presignSchema.parse(req.body);
    const result = await prisma.inspectionResult.findUnique({ where: { id: data.inspectionResultId } });
    if (!result) throw new HttpError(404, "inspection_result_not_found");

    const ext = data.contentType === "image/png" ? "png" : data.contentType === "image/webp" ? "webp" : "jpg";
    const objectKey = `inspection-results/${data.inspectionResultId}/${uuidv4()}.${ext}`;
    const uploadUrl = await getPresignedUploadUrl(objectKey);

    res.json({ uploadUrl, objectKey });
  } catch (err) {
    next(err);
  }
});

const savePhotoSchema = z.object({
  objectKey: z.string().min(1),
  highlightX: z.number().min(0).max(1).optional(),
  highlightY: z.number().min(0).max(1).optional(),
  highlightRadius: z.number().min(0).max(1).optional(),
  capturedAt: z.string().datetime().optional(),
});

// บันทึก metadata รูป (รวมตำแหน่งวงกลมไฮไลต์จุดเสีย) หลังอัปโหลดสำเร็จ
uploadsRouter.post(
  "/inspection-results/:id/photos",
  requireRole("operator", "engineer", "admin"),
  async (req, res, next) => {
    try {
      const data = savePhotoSchema.parse(req.body);
      const photo = await prisma.inspectionPhoto.create({
        data: {
          inspectionResultId: req.params.id,
          objectKey: data.objectKey,
          highlightX: data.highlightX,
          highlightY: data.highlightY,
          highlightRadius: data.highlightRadius,
          capturedAt: data.capturedAt ? new Date(data.capturedAt) : undefined,
        },
      });
      res.status(201).json(photo);
    } catch (err) {
      next(err);
    }
  }
);

uploadsRouter.get("/photos/:id/view-url", requireRole("engineer", "admin", "operator"), async (req, res, next) => {
  try {
    const photo = await prisma.inspectionPhoto.findUnique({ where: { id: req.params.id } });
    if (!photo) throw new HttpError(404, "photo_not_found");
    const url = await getPresignedViewUrl(photo.objectKey);
    res.json({ url });
  } catch (err) {
    next(err);
  }
});
