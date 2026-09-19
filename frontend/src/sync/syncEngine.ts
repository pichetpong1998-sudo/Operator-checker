import { apiFetch } from "../api/client";
import { listQueuedInspections, removeQueuedInspection, getPhotoBlob, deletePhotoBlob } from "../db/offlineQueue";
import type { OfflineInspectionQueueItem } from "../types";

export interface SyncResultSummary {
  synced: number;
  rejected: number;
  remaining: number;
}

/**
 * เรียกเมื่อกลับมาออนไลน์ (window "online" event หรือ periodic check) เพื่อส่งรายการค้างใน
 * IndexedDB queue เข้า server ทีละชุด (batch) ผ่าน /inspections/sync-batch
 * server จะ validate geofence ซ้ำและใช้ idempotencyKey กันข้อมูลซ้ำ
 */
export async function runSync(onProgress?: (msg: string) => void): Promise<SyncResultSummary> {
  const queued = await listQueuedInspections();
  if (queued.length === 0) return { synced: 0, rejected: 0, remaining: 0 };

  onProgress?.(`กำลัง sync ${queued.length} รายการ...`);

  const BATCH_SIZE = 10;
  let synced = 0;
  let rejected = 0;

  for (let i = 0; i < queued.length; i += BATCH_SIZE) {
    const batch = queued.slice(i, i + BATCH_SIZE);
    const payload = {
      items: batch.map((item: OfflineInspectionQueueItem) => ({
        idempotencyKey: item.idempotencyKey,
        beltHeadCode: item.beltHeadCode,
        shiftName: item.shiftName,
        deviceId: item.deviceId,
        clientSubmittedAt: item.clientSubmittedAt,
        gps: item.gps,
        results: item.results.map((r) => ({
          checklistItemId: r.checklistItemId,
          resultValue: r.resultValue,
          numericValue: r.numericValue,
          noteText: r.noteText,
          voiceTranscript: r.voiceTranscript,
        })),
      })),
    };

    try {
      const res = await apiFetch<{ results: Array<{ idempotencyKey: string; status: string; error?: string }> }>(
        "/inspections/sync-batch",
        { method: "POST", body: JSON.stringify(payload) }
      );

      for (const r of res.results) {
        if (r.status === "synced" || r.status === "already_synced") {
          synced++;
          const original = batch.find((b) => b.idempotencyKey === r.idempotencyKey);
          if (original) {
            for (const result of original.results) {
              for (const photo of result.photos ?? []) {
                await deletePhotoBlob(photo.localId).catch(() => undefined);
                // TODO: อัปโหลดรูปเข้า MinIO ผ่าน /uploads/presign ก่อนลบ ถ้ายังไม่ได้อัปโหลด
              }
            }
          }
          await removeQueuedInspection(r.idempotencyKey);
        } else {
          rejected++;
          onProgress?.(`รายการ ${r.idempotencyKey} sync ไม่สำเร็จ: ${r.error ?? "unknown error"}`);
        }
      }
    } catch (err) {
      onProgress?.(`Sync batch ล้มเหลว (จะลองใหม่อัตโนมัติ): ${String(err)}`);
      break; // เครือข่ายอาจหลุดอีกครั้ง — หยุดและรอรอบถัดไป
    }
  }

  const remaining = (await listQueuedInspections()).length;
  return { synced, rejected, remaining };
}

export function registerAutoSync(onProgress?: (msg: string) => void) {
  window.addEventListener("online", () => {
    runSync(onProgress).catch((e) => onProgress?.(`Sync error: ${e}`));
  });
  // ตรวจซ้ำเป็นระยะ เผื่อ "online" event ไม่ fire (บาง mobile browser)
  setInterval(() => {
    if (navigator.onLine) {
      runSync(onProgress).catch(() => undefined);
    }
  }, 60_000);
}

export { getPhotoBlob };
