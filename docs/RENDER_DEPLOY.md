# Deploy ขึ้น Render.com (ใช้งานจริงภายนอกได้)

ระบบนี้มี `render.yaml` (Blueprint) พร้อมอยู่แล้วที่ root ของ repo — Render จะอ่านไฟล์นี้แล้วสร้าง service ทั้งหมดให้อัตโนมัติ (ฐานข้อมูล, Redis, Backend API, Frontend) คุณไม่ต้องตั้งค่าเองทีละตัว

ขั้นตอนที่ต้องทำเอง (ต้อง login เอง ผู้ช่วยกรอกรหัสผ่านให้ไม่ได้ตามข้อกำหนดความปลอดภัย):

## โหมดที่ใช้อยู่ตอนนี้: ทดลองฟรี (Free plan ทั้งหมด)

`render.yaml` ตั้งค่าเป็น **free plan ทั้งหมด** ($0) ตามที่เลือกไว้ — เหมาะสำหรับทดลองใช้งานกับทีมก่อนตัดสินใจจ่ายเงินจริง

ข้อจำกัดที่ต้องรู้ระหว่างทดลอง:

| Service | ข้อจำกัดบน Free plan |
|---|---|
| Backend API | **Sleep เมื่อไม่มีคนใช้ 15 นาที** (โหลดครั้งแรกหลัง sleep ใช้เวลา ~1 นาที) และ **ส่ง Email แจ้งเตือนไม่ได้** (free block พอร์ต SMTP 25/465/587) — LINE แจ้งเตือนยังใช้ได้ปกติ |
| PostgreSQL | **หมดอายุใน 30 วันแล้วลบข้อมูลทิ้งทั้งหมด** (มีช่วงผ่อนผันอีก 14 วันให้อัปเกรดก่อนลบจริง) — Render จะส่งอีเมลเตือนก่อน |
| Redis (Key Value) | ข้อมูลอยู่ใน memory ล้วน รีสตาร์ทเมื่อไหร่ข้อมูลหาย — แต่ใช้แค่ rate-limiting ชั่วคราวเท่านั้น ไม่กระทบข้อมูลตรวจสายพาน |
| Frontend | ไม่มีข้อจำกัด (Static Site ฟรีเสมอ) |
| Cloudflare R2 (เก็บรูป) | ฟรีจนกว่าจะเกิน 10GB |

**เมื่อพร้อมใช้งานจริง**: แก้ 2 บรรทัดใน `render.yaml` — เปลี่ยน `plan: free` ของ `hongsa-belt-db` เป็น `plan: 0.1c-256mb` (~$6/เดือน) และของ `hongsa-belt-backend` เป็น `plan: 0.5c-512mb` (~$7/เดือน) แล้ว commit ใหม่ Render จะอัปเกรดให้อัตโนมัติ ข้อมูลไม่หาย รวมแล้วประมาณ **$13/เดือน (~470 บาท)**

---

## ขั้นตอนที่ 1 — สมัคร Render และ Deploy

1. ไปที่ https://dashboard.render.com/register → กด **Sign up with GitHub** → login ด้วยบัญชี GitHub ที่มี repo `Operator-checker` (ที่ push ไปแล้ว)
2. ในหน้า Dashboard กด **New +** → เลือก **Blueprint**
3. เลือก repo `pichetpong1998-sudo/Operator-checker`
4. Render จะเจอไฟล์ `render.yaml` อัตโนมัติ และแสดงรายการ service ที่จะสร้าง: `hongsa-belt-db`, `hongsa-belt-redis`, `hongsa-belt-backend`, `hongsa-belt-frontend`
5. **อย่าเพิ่งกด Apply** — เลื่อนดูช่อง environment variable ที่ต้องกรอกเอง (จะมีเครื่องหมายเตือนสีเหลือง) แล้วไปทำขั้นตอนที่ 2 ก่อน (หรือกรอกทีหลังก็ได้ผ่านหน้า service → Environment)

## ขั้นตอนที่ 2 — เก็บรูปถ่าย ด้วย Cloudflare R2 (ฟรี)

ระบบต้องมีที่เก็บรูปถ่ายแบบ S3-compatible เราใช้ Cloudflare R2 แทนการรัน MinIO เอง เพราะฟรีและไม่ต้องดูแล:

1. สมัคร https://dash.cloudflare.com/sign-up (ฟรี ไม่ต้องใส่บัตรเครดิตสำหรับ R2 free tier)
2. เมนูซ้าย → **R2 Object Storage** → **Create bucket** → ตั้งชื่อ `belt-inspection-photos`
3. เมนู R2 → **Manage API Tokens** → **Create API Token** → เลือก **Object Read & Write** → จำกัดสิทธิ์เฉพาะ bucket `belt-inspection-photos` → **Create API Token**
4. จะได้ 3 ค่า: **Access Key ID**, **Secret Access Key**, และ **Endpoint** (รูปแบบ `https://<account-id>.r2.cloudflarestorage.com`) — คัดลอกเก็บไว้ (Secret Key แสดงครั้งเดียว)
5. กลับไปที่ Render → service `hongsa-belt-backend` → แท็บ **Environment** → กรอก:
   - `MINIO_ENDPOINT` = `<account-id>.r2.cloudflarestorage.com` (ตัด `https://` ออก)
   - `MINIO_ACCESS_KEY` = Access Key ID
   - `MINIO_SECRET_KEY` = Secret Access Key

## ขั้นตอนที่ 3 — แจ้งเตือน Email / LINE (ไม่บังคับ ทำทีหลังได้)

ถ้ายังไม่พร้อม เว้นว่างไว้ก่อนได้ ระบบทำงานปกติ แค่ยังไม่ส่งแจ้งเตือน — ทำตอนไหนก็ได้ทีหลังผ่าน Environment tab เดียวกัน

- **Email**: กรอก `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `ALERT_EMAIL_RECIPIENTS` (คั่นด้วยคอมมาถ้าหลายคน) — แนะนำใช้ Gmail App Password หรือผู้ให้บริการ SMTP อื่น
- **LINE**: สร้าง LINE Official Account + Messaging API ที่ https://developers.line.biz แล้วกรอก `LINE_CHANNEL_ACCESS_TOKEN` และ `LINE_ALERT_GROUP_ID`

## ขั้นตอนที่ 4 — Deploy

1. กลับไปหน้า Blueprint กด **Apply**
2. รอ build (backend ~5-10 นาทีครั้งแรก, frontend ~2-3 นาที) — ดู progress ได้ในหน้า Logs ของแต่ละ service
3. Migration ฐานข้อมูลรันอัตโนมัติทุกครั้งที่ backend start (`prisma migrate deploy` อยู่ใน Dockerfile แล้ว) ไม่ต้องทำอะไรเพิ่ม

## ขั้นตอนที่ 5 — สร้างข้อมูลเริ่มต้น (หัวสายพาน 11 จุด, checklist 18 ข้อ, user ทดสอบ 3 role)

Plan free ไม่มีแท็บ Shell ให้ใช้ ระบบจึงมี URL พิเศษสำหรับสร้างข้อมูลเริ่มต้นแทน (เรียกกี่ครั้งก็ได้อย่างปลอดภัย ไม่ทับข้อมูลเดิม):

1. ไปที่ service `hongsa-belt-backend` → แท็บ **Environment** → หาค่า `BOOTSTRAP_TOKEN` (Render สุ่มให้อัตโนมัติ) → คัดลอกค่านั้น
2. เปิด URL นี้ในเบราว์เซอร์ (แทน `<BOOTSTRAP_TOKEN>` ด้วยค่าที่คัดลอกมา และแทนชื่อ backend ด้วย URL จริงจากหน้า Render):
   ```
   https://hongsa-belt-backend.onrender.com/api/v1/bootstrap?token=<BOOTSTRAP_TOKEN>
   ```
3. ถ้าสำเร็จจะเห็นข้อความ JSON `"ok": true` พร้อมสรุปจำนวนข้อมูลที่สร้าง — เสร็จแล้วได้ user ทดสอบ 3 role (Admin/Engineer/Operator)
4. **เปลี่ยนรหัส/สร้าง user จริงทันทีผ่านหน้า Admin แล้วลบ user ทดสอบทิ้ง** — และควรลบ/หมุนค่า `BOOTSTRAP_TOKEN` ทิ้งหลังใช้เสร็จ (แก้ค่าใน Environment tab แล้ว save)

## ขั้นตอนที่ 6 — ทดสอบและตั้งพิกัด

1. เปิด `https://hongsa-belt-frontend.onrender.com` (ชื่อจริงดูได้จากหน้า Render Dashboard ของ service frontend)
2. Login ด้วย Admin → เมนูพิกัด (Geofence) → กรอกพิกัดจริงของหัวสายพานทั้ง 11 จุด (ดูวิธีในคู่มือ Admin)
3. ทดสอบ login ครบทั้ง 3 role ก่อนให้ทีมใช้งานจริง

---

## หมายเหตุทางเทคนิค

- ถ้า Render ตั้งชื่อ URL ของ service ไม่ตรงกับที่คาดไว้ (เช่นมีเลขต่อท้ายเพราะชื่อซ้ำ) ต้องแก้ 2 จุดใน `render.yaml` ให้ตรงกับ URL จริง แล้ว commit ใหม่: `CORS_ORIGIN` (ใน backend) และ `destination` ของ route `/api/*` (ใน frontend)
- Frontend เป็น Static Site ใช้ rewrite rule ส่ง `/api/*` ไปที่ backend แบบ server-side ผู้ใช้จะไม่เห็นความต่างของโดเมนเลย ถ้าพบปัญหาอัปโหลดรูปหรือ auth header ผ่าน rewrite นี้ไม่ได้ตามที่ตั้งใจ ทางเลือกสำรองคือ deploy frontend เป็น Docker service (ใช้ `frontend/Dockerfile` เดิม) แทน Static Site — บอกได้ ช่วยปรับให้ทีหลังได้
- ทุก secret (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`) ถูกสุ่มโดย Render เอง (`generateValue: true`) ไม่มีใครเห็นค่าจริงรวมถึงตัวผู้ช่วยเอง
