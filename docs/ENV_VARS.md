# รายการ Environment Variables

ค่าทั้งหมดต้องกำหนดผ่าน environment variables — ห้าม hard-code ใน source code (ดู `backend/src/config/env.ts` ซึ่ง validate ค่าเหล่านี้ด้วย Zod ตอน startup, ถ้าค่าที่จำเป็นขาดหายระบบจะไม่ start)

## ใช้กับ `docker-compose.yml` (ไฟล์ `.env` ที่ root)

| ตัวแปร | จำเป็น | ตัวอย่าง/ค่าเริ่มต้น | คำอธิบาย |
|---|---|---|---|
| `POSTGRES_USER` | ✅ | `belt_check_app` | Username ของ PostgreSQL |
| `POSTGRES_PASSWORD` | ✅ | สุ่มเอง | Password ของ PostgreSQL — สุ่มด้วย `openssl rand -base64 32` |
| `POSTGRES_DB` | ✅ | `belt_check_db` | ชื่อฐานข้อมูล |
| `JWT_ACCESS_SECRET` | ✅ | สุ่มเอง (≥16 ตัวอักษร) | Secret เซ็น JWT access token — สุ่มด้วย `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | ✅ | สุ่มเอง (คนละค่ากับ access) | Secret เซ็น JWT refresh token |
| `JWT_ACCESS_TTL` | ไม่ | `15m` | อายุ access token |
| `JWT_REFRESH_TTL` | ไม่ | `30d` | อายุ refresh token |
| `MAX_GPS_ACCURACY_M` | ไม่ | `35` | ค่าความแม่นยำ GPS สูงสุดที่ยอมรับ (เมตร) — ปฏิเสธถ้า accuracy แย่กว่านี้ |
| `PREFLIGHT_TOKEN_TTL_MIN` | ไม่ | `10` | อายุ token ที่ออกหลังผ่าน preflight GPS check (นาที) |
| `MINIO_ACCESS_KEY` | ✅ | สุ่มเอง | MinIO root/access key |
| `MINIO_SECRET_KEY` | ✅ | สุ่มเอง | MinIO secret key |
| `MINIO_BUCKET` | ไม่ | `belt-inspection-photos` | ชื่อ bucket เก็บรูปภาพ |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | ไม่ (จำเป็นถ้าต้องการแจ้งเตือน Email) | - | ค่าตั้งค่า SMTP server สำหรับส่ง Email แจ้งเตือน Critical Fail |
| `ALERT_EMAIL_RECIPIENTS` | ไม่ | - | รายชื่ออีเมลผู้รับแจ้งเตือน คั่นด้วย comma |
| `LINE_CHANNEL_ACCESS_TOKEN` | ไม่ (จำเป็นถ้าต้องการแจ้งเตือน LINE) | - | Channel access token จาก LINE Developers Console (LINE Messaging API) |
| `LINE_ALERT_GROUP_ID` | ไม่ | - | Group ID หรือ User ID ปลายทางที่จะ push ข้อความแจ้งเตือน |
| `CORS_ORIGIN` | ไม่ | `*` | โดเมนที่อนุญาตให้เรียก API (production ควรระบุโดเมนจริง ไม่ใช้ `*`) |

## ใช้กับ backend local dev (`backend/.env`)

เหมือนด้านบน บวกกับ:

| ตัวแปร | จำเป็น | คำอธิบาย |
|---|---|---|
| `DATABASE_URL` | ✅ | Connection string เต็มรูปแบบ เช่น `postgresql://user:pass@localhost:5432/db` |
| `PORT` | ไม่ (default 4000) | พอร์ตที่ backend API listen |
| `MINIO_ENDPOINT` / `MINIO_PORT` / `MINIO_USE_SSL` | ✅ (dev) | ที่อยู่ MinIO server สำหรับ local |
| `REDIS_URL` | ไม่ (default `redis://localhost:6379`) | ใช้สำหรับ rate-limit/cache ในอนาคต |

## หมายเหตุความปลอดภัย

- ห้าม commit ไฟล์ `.env` เข้า version control (มี `.gitignore` รองรับแล้ว)
- หมุนเวียน (rotate) `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` เป็นระยะ — การเปลี่ยนค่าจะทำให้ทุก session เดิม logout ทันที
- `POSTGRES_PASSWORD`, `MINIO_SECRET_KEY`, `LINE_CHANNEL_ACCESS_TOKEN` ควรเก็บใน secret manager ขององค์กร (เช่น Vault, AWS Secrets Manager) ถ้ามี ไม่ใช่ไฟล์ .env เปลือย ๆ บน production server ถ้าเป็นไปได้
