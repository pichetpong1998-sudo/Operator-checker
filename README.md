# ระบบตรวจเช็คหัวสายพานรายชั่วโมง — โครงการเหมืองหงสา สปป.ลาว

ระบบ Production-grade PWA สำหรับตรวจเช็คหัวสายพานลำเลียงถ่านหินรายชั่วโมง รองรับ 3 บทบาท (Operator, Engineer, Admin) พร้อม GPS Geofence validation, Offline sync, และแจ้งเตือน Critical Fail ผ่าน Email/LINE

ดูสถาปัตยกรรม, data model และ API design เต็มรูปแบบที่ [`ARCHITECTURE.md`](./ARCHITECTURE.md)

## โครงสร้างโปรเจกต์

```
hongsa-belt-inspection/
├── backend/            Node.js + Express + TypeScript + Prisma (PostgreSQL)
├── frontend/           React PWA (Vite, Tailwind, Workbox)
├── docs/                คู่มือใช้งานและเอกสารประกอบ
├── docker-compose.yml   Deploy ทั้งระบบด้วย Docker
├── Caddyfile            Reverse proxy + HTTPS อัตโนมัติ
├── ARCHITECTURE.md       สถาปัตยกรรม/data model/API design
└── .env.example          รายการ environment variables ทั้งหมด
```

## เริ่มต้นใช้งานด่วน (Docker — แนะนำสำหรับ Production)

### ข้อกำหนดเบื้องต้น
- Linux server (Ubuntu 22.04 ขึ้นไปแนะนำ) พร้อม Docker Engine 24+ และ Docker Compose plugin
- โดเมนที่ชี้มาที่ IP server (สำหรับ HTTPS อัตโนมัติผ่าน Let's Encrypt) หรือใช้ internal CA สำหรับทดสอบใน LAN (ดู `Caddyfile`)
- พอร์ต 80/443 เปิดออกอินเทอร์เน็ต หรือ LAN ของโครงการ

### ขั้นตอนติดตั้ง

1. **โคลน/คัดลอกโปรเจกต์ไปยัง server**

   ```bash
   cd /opt
   # คัดลอกโฟลเดอร์ hongsa-belt-inspection ทั้งหมดไปที่ /opt/hongsa-belt-inspection
   cd hongsa-belt-inspection
   ```

2. **ตั้งค่า environment variables**

   ```bash
   cp .env.example .env
   nano .env   # กรอกค่าจริงทั้งหมด โดยเฉพาะรหัสผ่าน DB, JWT secret, MinIO key, SMTP, LINE token
   ```

   สร้างค่า secret แบบสุ่มด้วย:
   ```bash
   openssl rand -base64 48
   ```

   ดูรายละเอียดตัวแปรทั้งหมดที่ [`docs/ENV_VARS.md`](./docs/ENV_VARS.md)

3. **แก้ไขโดเมนใน `Caddyfile`** ให้ตรงกับโดเมนจริงของโครงการ (หรือดูทางเลือกใช้ `tls internal` สำหรับทดสอบใน LAN)

4. **Build และรันทุก service**

   ```bash
   docker compose up -d --build
   ```

   คำสั่งนี้จะ:
   - สร้าง PostgreSQL, MinIO, Redis, Backend API, Frontend, Reverse proxy (Caddy)
   - รัน Prisma migration อัตโนมัติตอน backend container start (`prisma migrate deploy`)

5. **ตรวจสอบสถานะ**

   ```bash
   docker compose ps
   docker compose logs -f backend
   curl -k https://<โดเมนของคุณ>/healthz
   ```

6. **สร้าง Admin คนแรก**

   หลัง migration สำเร็จ รันคำสั่ง seed (สร้างหัวสายพาน 11 หัว + checklist มาตรฐาน + ผู้ใช้ทดสอบ):

   ```bash
   docker compose exec backend npm run prisma:seed
   ```

   > ⚠️ **สำคัญ**: ค่า PIN ตัวอย่างจาก seed script (`ADM001` / PIN `192837`) เป็นข้อมูลทดสอบเท่านั้น
   > ให้ Admin **เปลี่ยน PIN ทันที** ผ่านหน้า Login → เปลี่ยน PIN หรือใช้ API `/auth/change-pin`
   > และควรสร้าง Admin ตัวจริงใหม่ผ่านหน้า Admin → ผู้ใช้งาน แล้วปิดใช้งาน (suspend) บัญชี `ADM001` ตัวอย่างทิ้ง

7. **ตั้งพิกัด GPS จริงของแต่ละหัวสายพาน**

   เข้าสู่ระบบด้วย Admin → เมนู "พิกัด/Geofence" → เดินไปยืนที่หัวสายพานแต่ละจุดจริง แล้วกด "ใช้ตำแหน่งปัจจุบันของอุปกรณ์นี้" เพื่อบันทึกพิกัดจริง (ค่าจาก seed เป็นพิกัดสมมติสำหรับทดสอบเท่านั้น — **ต้องแก้ก่อนใช้งานจริง**)

8. **ติดตั้ง PWA บนมือถือ Operator**

   เปิด `https://<โดเมนของคุณ>` ด้วย Chrome (Android) หรือ Safari (iPhone) → เลือก "เพิ่มลงหน้าจอโฮม" / "Add to Home Screen"

## รัน Backend/Frontend แบบ Local (Development)

```bash
# Backend
cd backend
cp .env.example .env   # แก้ DATABASE_URL ให้ชี้ Postgres local ของคุณ
npm install
npx prisma migrate dev
npm run prisma:seed
npm run dev             # http://localhost:4000

# Frontend (terminal อีกอัน)
cd frontend
npm install
npm run dev              # http://localhost:5173 (proxy /api ไปที่ backend:4000)
```

## รัน Tests

```bash
cd backend
npm install
npm test        # authentication + geofence validation tests (ไม่ต้องมี PostgreSQL จริง — ใช้ mock)
```

## Reverse Proxy / HTTPS

โปรเจกต์นี้ใช้ **Caddy** เป็น reverse proxy ด่านหน้าสุด เพราะขอและต่ออายุใบรับรอง TLS จาก Let's Encrypt ให้อัตโนมัติ โดยไม่ต้องตั้งค่า certbot แยก

ถ้าต้องการใช้ **Nginx + certbot** แทน ดูตัวอย่างการตั้งค่าใน [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md)

## เอกสารเพิ่มเติม

| เอกสาร | เนื้อหา |
|---|---|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Architecture, Data Model, API Design |
| [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) | ขั้นตอนติดตั้งบน Linux server แบบละเอียด + Nginx/certbot ทางเลือก |
| [`docs/ENV_VARS.md`](./docs/ENV_VARS.md) | รายการ environment variables ทั้งหมด |
| [`docs/OPERATOR_GUIDE.md`](./docs/OPERATOR_GUIDE.md) | คู่มือใช้งานสำหรับ Operator |
| [`docs/ENGINEER_GUIDE.md`](./docs/ENGINEER_GUIDE.md) | คู่มือใช้งานสำหรับ Engineer |
| [`docs/ADMIN_GUIDE.md`](./docs/ADMIN_GUIDE.md) | คู่มือใช้งานสำหรับ Admin |
| [`docs/GPS_SPOOFING_AND_MDM.md`](./docs/GPS_SPOOFING_AND_MDM.md) | ข้อจำกัดด้าน GPS spoofing + ข้อเสนอแนะการใช้ MDM |

## ความปลอดภัย — สรุปสิ่งที่ทำไว้แล้ว

- PIN เก็บด้วย Argon2id hash (ไม่เก็บ plaintext)
- JWT access token อายุสั้น (15 นาที) + refresh token + token revocation ผ่าน `tokenVersion`
- RBAC บังคับที่ backend ทุก endpoint (ไม่พึ่ง frontend ในการซ่อนปุ่ม/เมนูเพียงอย่างเดียว)
- Server ตรวจ GPS accuracy + geofence ซ้ำทุกครั้งก่อนรับผลตรวจ (ไม่เชื่อ client)
- ไม่มี secret ใด ๆ ฝังใน source code — ใช้ environment variables ทั้งหมด
- Rate limiting ที่ login endpoint ป้องกัน brute-force PIN
- Audit log ครอบคลุม login, การตั้งพิกัด, การตรวจ geofence, การแก้ไขข้อมูล, การส่งผลตรวจ, การ export
- Helmet security headers, CORS จำกัด origin, HTTPS บังคับผ่าน reverse proxy
