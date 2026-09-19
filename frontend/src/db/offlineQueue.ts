import { openDB, type IDBPDatabase } from "idb";
import type { OfflineInspectionQueueItem } from "../types";

/**
 * IndexedDB ใช้เป็น "Sync Queue" ชั่วคราวเท่านั้น (ตามข้อกำหนด)
 * - ไม่ใช่แหล่งข้อมูลหลักของระบบ: dashboard/report/ประวัติทั้งหมดอ่านจาก server เท่านั้น
 * - เมื่อ sync สำเร็จ รายการจะถูกลบออกจากคิวทันที
 * - เก็บรูปเป็น Blob แยก store เพื่อไม่ให้ queue item โตเกินไป
 */
const DB_NAME = "belt-check-offline-queue";
const DB_VERSION = 1;
const QUEUE_STORE = "inspection_queue";
const PHOTO_STORE = "photo_blobs";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(QUEUE_STORE)) {
          db.createObjectStore(QUEUE_STORE, { keyPath: "idempotencyKey" });
        }
        if (!db.objectStoreNames.contains(PHOTO_STORE)) {
          db.createObjectStore(PHOTO_STORE, { keyPath: "localId" });
        }
      },
    });
  }
  return dbPromise;
}

export async function enqueueInspection(item: OfflineInspectionQueueItem): Promise<void> {
  const db = await getDb();
  await db.put(QUEUE_STORE, item);
}

export async function listQueuedInspections(): Promise<OfflineInspectionQueueItem[]> {
  const db = await getDb();
  return db.getAll(QUEUE_STORE);
}

export async function removeQueuedInspection(idempotencyKey: string): Promise<void> {
  const db = await getDb();
  await db.delete(QUEUE_STORE, idempotencyKey);
}

export async function updateQueuedInspection(item: OfflineInspectionQueueItem): Promise<void> {
  const db = await getDb();
  await db.put(QUEUE_STORE, item);
}

export async function savePhotoBlob(localId: string, blob: Blob): Promise<void> {
  const db = await getDb();
  await db.put(PHOTO_STORE, { localId, blob });
}

export async function getPhotoBlob(localId: string): Promise<Blob | null> {
  const db = await getDb();
  const record = await db.get(PHOTO_STORE, localId);
  return record?.blob ?? null;
}

export async function deletePhotoBlob(localId: string): Promise<void> {
  const db = await getDb();
  await db.delete(PHOTO_STORE, localId);
}

export async function queueLength(): Promise<number> {
  const db = await getDb();
  return db.count(QUEUE_STORE);
}
