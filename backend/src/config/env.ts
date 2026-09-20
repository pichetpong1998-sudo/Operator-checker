import "dotenv/config";
import { z } from "zod";

// ทุกค่าต้องมาจาก environment variable — ห้าม hard-code secret ใน source code
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET must be set and >=16 chars"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be set and >=16 chars"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),

  REDIS_URL: z.string().default("redis://localhost:6379"),

  MAX_GPS_ACCURACY_M: z.coerce.number().default(35),
  PREFLIGHT_TOKEN_TTL_MIN: z.coerce.number().default(10),

  MINIO_ENDPOINT: z.string().default("localhost"),
  MINIO_PORT: z.coerce.number().default(9000),
  MINIO_USE_SSL: z.coerce.boolean().default(false),
  // ถ้ายังไม่ตั้งค่า (เช่นช่วงทดลองระบบก่อนตั้ง Cloudflare R2/MinIO จริง) ระบบยัง boot ได้ปกติ
  // แค่ฟีเจอร์อัปโหลดรูปจะ error เฉพาะตอนมีคนกดอัปโหลดจริงเท่านั้น ไม่กระทบส่วนอื่น
  MINIO_ACCESS_KEY: z.string().default("not-configured"),
  MINIO_SECRET_KEY: z.string().default("not-configured"),
  MINIO_BUCKET: z.string().default("belt-inspection-photos"),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  ALERT_EMAIL_RECIPIENTS: z.string().optional(), // comma-separated

  LINE_CHANNEL_ACCESS_TOKEN: z.string().optional(),
  LINE_ALERT_GROUP_ID: z.string().optional(),

  CORS_ORIGIN: z.string().default("*"),
  ADMIN_BOOTSTRAP_EMPLOYEE_CODE: z.string().optional(),
  ADMIN_BOOTSTRAP_PIN: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration. See .env.example");
}

export const env = parsed.data;
