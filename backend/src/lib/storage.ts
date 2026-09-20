import { Client as MinioClient } from "minio";
import { env } from "../config/env";

export const minioClient = new MinioClient({
  endPoint: env.MINIO_ENDPOINT,
  port: env.MINIO_PORT,
  useSSL: env.MINIO_USE_SSL,
  accessKey: env.MINIO_ACCESS_KEY,
  secretKey: env.MINIO_SECRET_KEY,
});

export const BUCKET = env.MINIO_BUCKET;

export async function ensureBucket(): Promise<void> {
  const exists = await minioClient.bucketExists(BUCKET).catch(() => false);
  if (!exists) {
    await minioClient.makeBucket(BUCKET);
  }
}

/**
 * สร้าง presigned PUT URL ให้ client อัปโหลดรูปตรงไป MinIO
 * object key มี prefix ตาม inspection result id เพื่อกำหนดสิทธิ์/ตรวจสอบย้อนหลังได้
 */
export async function getPresignedUploadUrl(objectKey: string, expirySeconds = 300): Promise<string> {
  return minioClient.presignedPutObject(BUCKET, objectKey, expirySeconds);
}

/**
 * สร้าง presigned GET URL สำหรับแสดงรูป (จำกัดสิทธิ์ ไม่ public bucket)
 */
export async function getPresignedViewUrl(objectKey: string, expirySeconds = 3600): Promise<string> {
  return minioClient.presignedGetObject(BUCKET, objectKey, expirySeconds);
}
