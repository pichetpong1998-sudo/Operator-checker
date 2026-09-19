// ตั้งค่า environment variable จำลองสำหรับรัน test เท่านั้น (ไม่ใช้ค่านี้ใน production)
// รันก่อน test files ทั้งหมด เพื่อให้ src/config/env.ts ผ่านการ validate
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test_db";
process.env.JWT_ACCESS_SECRET = "test-only-access-secret-not-for-prod";
process.env.JWT_REFRESH_SECRET = "test-only-refresh-secret-not-for-prod";
process.env.MINIO_ACCESS_KEY = "test-access-key";
process.env.MINIO_SECRET_KEY = "test-secret-key";
process.env.MAX_GPS_ACCURACY_M = "35";
