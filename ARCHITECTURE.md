# ระบบตรวจเช็คหัวสายพานรายชั่วโมง — โครงการเหมืองหงสา สปป.ลาว
## Architecture, Data Model, API Design (v1.0)

> เอกสารนี้สรุปสถาปัตยกรรมก่อนเริ่มพัฒนา ตามที่ผู้ใช้ร้องขอ

---

## 1. ภาพรวม Architecture

```
                         ┌─────────────────────────┐
                         │   Operator Mobile (PWA)  │
                         │  Android/iPhone Browser  │
                         │  - Service Worker        │
                         │  - IndexedDB Offline Q.  │
                         └───────────┬──────────────┘
                                     │ HTTPS (TLS 1.2+)
                                     │
                         ┌───────────▼──────────────┐
                         │   Reverse Proxy (Nginx/   │
                         │   Caddy) — TLS termination │
                         └───────────┬──────────────┘
                                     │
              ┌──────────────────────┼───────────────────────┐
              │                      │                        │
    ┌─────────▼─────────┐  ┌─────────▼─────────┐   ┌──────────▼─────────┐
    │  Frontend static    │  │  Backend API       │   │  Object Storage    │
    │  (React PWA build,  │  │  (Node.js/Express  │   │  (MinIO, S3 compat)│
    │  served by Nginx)   │  │  + TypeScript)      │   │  - inspection photos│
    └─────────────────────┘  └─────────┬──────────┘   └─────────────────────┘
                                        │
                       ┌────────────────┼────────────────┐
                       │                │                 │
              ┌────────▼───────┐ ┌──────▼──────┐  ┌───────▼────────┐
              │  PostgreSQL     │ │  Redis      │  │  Notification    │
              │  (production DB)│ │ (rate-limit,│  │  Workers          │
              │                 │ │  session    │  │  - SMTP (Email)   │
              │                 │ │  blacklist) │  │  - LINE Messaging │
              └─────────────────┘ └─────────────┘  │    API            │
                                                     └────────────────────┘
```

**หลักการออกแบบสำคัญ**
1. **Server เป็นความจริงหนึ่งเดียว (single source of truth)** — พิกัด geofence, threshold, สิทธิ์ผู้ใช้ เก็บที่ DB กลางเท่านั้น มือถือทุกเครื่องดึงค่าจาก API เสมอ ไม่ hard-code ในแอป
2. **Server ตรวจซ้ำทุกอย่างที่ client อ้าง** — GPS accuracy, ระยะห่างจาก geofence, เวลา, role ของผู้ใช้ ถูก validate ที่ backend ทุกครั้งก่อนรับข้อมูล (ห้ามเชื่อ client เพียงอย่างเดียว เพราะ mock-GPS ทำได้ง่ายบน Android)
3. **Offline-first เฉพาะ Operator flow** — ใช้ IndexedDB เป็น "Sync Queue" ชั่วคราวเท่านั้น ไม่ใช่แหล่งข้อมูลหลัก เมื่อออนไลน์จะ sync เข้า PostgreSQL ทันทีและลบออกจากคิว
4. **Stateless API + short-lived JWT** — access token อายุสั้น (15 นาที) + refresh token (เก็บใน httpOnly cookie หรือ secure storage) รองรับ revoke ผ่าน Redis blacklist / token version ใน DB
5. **แยก concern ชัดเจน**: Auth, Geofence validation, Inspection, Notification, Audit เป็นโมดูลอิสระต่อกัน ง่ายต่อการเขียน test

### Technology Stack

| Layer | เทคโนโลยี | เหตุผล |
|---|---|---|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS, `vite-plugin-pwa` (Workbox) | Mobile-first, PWA ติดตั้งได้ทั้ง Android/iOS, build เล็ก เร็ว |
| Offline storage | IndexedDB ผ่าน `idb` — เฉพาะ Sync Queue (checklist ที่ยังไม่ส่ง + รูปที่ยังไม่อัปโหลด) | ตามข้อกำหนด: ห้ามใช้เป็นแหล่งข้อมูลหลัก ใช้เป็นคิวชั่วคราวเท่านั้น |
| Backend | Node.js 20 + Express + TypeScript | Ecosystem กว้าง, deploy ง่ายบน Linux server, ทีมงาน mining/OT มักคุ้นเคย |
| ORM/Migration | Prisma | Type-safe, migration versioning ชัดเจน, generate SQL migration files ตรวจสอบได้ |
| Database | PostgreSQL 15 | Production-grade, รองรับ geospatial (คำนวณระยะทางด้วย Haversine ใน SQL/JS), ACID |
| Object storage | MinIO (S3-compatible) | Self-host ได้บน on-prem server ของเหมือง, กำหนดสิทธิ์ per-bucket/presigned URL ได้ |
| Cache/Session | Redis | Token blacklist, rate-limiting, dashboard cache |
| Auth | JWT (access+refresh) + PIN hashed ด้วย Argon2id | ไม่เก็บ PIN plaintext, ป้องกัน brute-force |
| Notification | Nodemailer (SMTP) + LINE Messaging API (push) | ตามข้อกำหนด Critical Fail alert |
| Container | Docker + docker-compose | Deploy บน on-prem Linux server ของโครงการเหมือง |
| Reverse proxy | Nginx (หรือ Caddy สำหรับ auto-HTTPS) | TLS termination, บังคับ HTTPS |
| Testing | Vitest + Supertest (backend), Vitest + Testing Library (frontend) | เร็ว, รองรับ TypeScript native |

---

## 2. Data Model (ER Overview)

### ตารางหลัก

```
users                    belt_heads               geofences
------------------       ------------------        ------------------
id (uuid, PK)            id (uuid, PK)              id (uuid, PK)
employee_code (unique)   code (unique) e.g. S2C      belt_head_id (FK, 1:1)
full_name                name                        latitude (numeric)
pin_hash                 active (bool)               longitude (numeric)
role (enum)              created_at                  radius_m (int, default 50)
  operator|engineer|admin                             updated_by (FK users)
status (enum)                                         updated_at
  active|suspended
line_user_id (nullable)
email (nullable)
created_at / updated_at
last_login_at

checklist_item_defs           inspection_shifts          inspections
------------------------      ------------------------    ------------------------
id (uuid, PK)                 id (uuid, PK)                id (uuid, PK)
code e.g. DRIVE_1_OIL          shift_date                  belt_head_id (FK)
label_th / label_en            shift_name (day/night)      operator_id (FK users)
category (enum, ดูหมวดด้านล่าง) status                      shift_id (FK, nullable)
input_type                                                  started_at / submitted_at
  (pass_fail_na | numeric)                                  client_submitted_at (จาก device, สำหรับ offline)
unit (nullable, เช่น "bar","°C")                           check_in_lat / lng / accuracy_m
threshold_min / threshold_max                               geofence_check_passed (bool)
  (nullable, สำหรับ input_type=numeric)                     geofence_distance_m
applies_to_belt_head[]                                      status (enum)
  (array/join table — บาง item เฉพาะบางหัว)                    submitted|offline_pending|synced
sort_order                                                   sync_source (web|offline_sync)
active (bool)                                                device_id (nullable)
                                                              created_at

inspection_results             inspection_photos           notifications
------------------------       ------------------------     ------------------------
id (uuid, PK)                  id (uuid, PK)                 id (uuid, PK)
inspection_id (FK)             inspection_result_id (FK)     type (critical_fail|threshold_exceeded)
checklist_item_id (FK)         object_key (MinIO path)       channel (email|line)
result_value (enum)            highlight_x / y / radius_px    recipient
  pass|fail|na                   (วงกลมไฮไลต์ตำแหน่งเสีย)       payload (jsonb)
numeric_value (nullable)       captured_at                    status (pending|sent|failed)
threshold_breached (bool)      uploaded_at                     sent_at
note_text (nullable)                                           related_inspection_id (FK)
voice_transcript (nullable)
created_at

audit_logs                     sync_offline_queue (client-side only — IndexedDB, ไม่อยู่บน server)
------------------------
id (uuid, PK)
actor_user_id (FK, nullable)
action (enum: login, login_failed, geofence_check,
  geofence_update, inspection_submit, user_create,
  user_role_change, pin_reset, export)
target_type / target_id
ip_address
user_agent
metadata (jsonb)
created_at
```

### ความสัมพันธ์สำคัญ
- `belt_heads` 1:1 `geofences` — พิกัด/รัศมีต่อหัวสายพาน 1 ค่า (ปรับได้โดย Admin เท่านั้น)
- `belt_heads` 1:N `inspections` — ประวัติการตรวจทั้งหมด
- `inspections` 1:N `inspection_results` — แต่ละ checklist item หนึ่งแถวผลตรวจ
- `inspection_results` 1:N `inspection_photos` — Fail หนึ่งข้อถ่ายได้หลายรูป พร้อมวงกลมไฮไลต์
- `checklist_item_defs` กำหนด "รายการตรวจมาตรฐาน" กลาง ใช้ร่วมกันทุกหัวสายพาน (Drive Unit 1–4 แยกรายการ, Belt Cleaner Primary/Secondary, Impact Carry Return, ฝุ่นที่ Chute, สภาพสายพาน, Pulley Primary/Secondary/Take-up, Pulley Tail, ดินที่ Cross Bar) — Admin แก้ threshold ได้โดยไม่ต้อง deploy โค้ดใหม่

### เหตุผลที่ไม่ใช้ Local Storage เป็นแหล่งข้อมูลหลัก
`sync_offline_queue` มีอยู่เฉพาะฝั่ง client (IndexedDB) เก็บ **เฉพาะรายการที่ยังไม่ sync สำเร็จ** เมื่อ sync แล้วจะลบทิ้งทันที ข้อมูล "ที่ยืนยันแล้ว" ทั้งหมดอยู่ใน PostgreSQL เท่านั้น — dashboard, report, trend อ่านจาก server เสมอ ไม่มีการอ่านค่าจริงจาก local storage

---

## 3. API Design (REST, JSON, `/api/v1`)

### Auth
| Method | Endpoint | Role | รายละเอียด |
|---|---|---|---|
| POST | `/auth/login` | public | employee_code + PIN → access+refresh token |
| POST | `/auth/refresh` | authenticated (refresh token) | ออก access token ใหม่ |
| POST | `/auth/logout` | authenticated | revoke refresh token |
| POST | `/auth/change-pin` | authenticated | เปลี่ยน PIN ตนเอง |

### Users (Admin)
| Method | Endpoint | Role |
|---|---|---|
| GET | `/users` | admin |
| POST | `/users` | admin — สร้างผู้ใช้ + กำหนด role |
| PATCH | `/users/:id` | admin — แก้ role/สถานะ |
| POST | `/users/:id/reset-pin` | admin |
| POST | `/users/:id/suspend` | admin |

### Geofences / Belt Heads (Admin ตั้งค่า, ทุก role อ่านได้)
| Method | Endpoint | Role |
|---|---|---|
| GET | `/belt-heads` | operator/engineer/admin |
| GET | `/belt-heads/:code/geofence` | operator/engineer/admin |
| PUT | `/belt-heads/:code/geofence` | admin — lat/lng/radius_m |

### Preflight GPS Check (ก่อนเปิด checklist)
| Method | Endpoint | Role |
|---|---|---|
| POST | `/preflight/gps-check` | operator — ส่ง lat/lng/accuracy_m + belt_head_code → server คำนวณระยะทาง (Haversine), ตรวจ accuracy ≤ MAX_GPS_ACCURACY_M (default 35m), คืนผล allow/deny + ระยะห่างจริง |

### Inspections
| Method | Endpoint | Role |
|---|---|---|
| POST | `/inspections` | operator — เปิดรอบตรวจใหม่ (ต้องแนบผล preflight ล่าสุด) |
| POST | `/inspections/:id/results` | operator — บันทึกผลแต่ละ checklist item (batch ได้) — **server ตรวจ geofence ซ้ำทุกครั้งที่ submit** |
| POST | `/inspections/:id/submit` | operator — ปิดรอบตรวจ |
| POST | `/inspections/sync-batch` | operator — ใช้ตอนกลับมาออนไลน์ ส่งหลายรายการจาก offline queue พร้อม `client_submitted_at`, idempotency key ป้องกันข้อมูลซ้ำ |
| GET | `/inspections` | engineer/admin — filter by belt_head/date/status |
| GET | `/inspections/:id` | engineer/admin/operator(เจ้าของ) |

### Uploads
| Method | Endpoint | Role |
|---|---|---|
| POST | `/uploads/presign` | operator — ขอ presigned URL อัปโหลดตรงไป MinIO |
| POST | `/inspection-results/:id/photos` | operator — บันทึก metadata รูป + ตำแหน่งวงกลมไฮไลต์ |

### Dashboard / Analytics (Engineer/Admin)
| Method | Endpoint | Role |
|---|---|---|
| GET | `/dashboard/status` | engineer/admin — Ready/Warning/Down ต่อหัวสายพาน |
| GET | `/dashboard/shift-progress` | engineer/admin — % ความคืบหน้าตรวจในกะปัจจุบัน |
| GET | `/dashboard/trends` | engineer/admin — trend ค่าตัวเลขย้อนหลัง |
| GET | `/exports/inspections.xlsx` | engineer/admin |
| GET | `/exports/inspections.pdf` | engineer/admin |

### Audit
| Method | Endpoint | Role |
|---|---|---|
| GET | `/audit-logs` | admin — filter by action/user/date |

**Authorization**: ทุก endpoint ผ่าน middleware `requireAuth` → `requireRole([...])`; token payload มี `role`, `sub` (user id), `tokenVersion` (สำหรับ revoke ทั้งหมดเมื่อรีเซ็ต PIN/ปิดผู้ใช้)

**Geofence double-check**: `/preflight/gps-check` ให้สิทธิ์ "เปิด checklist" ชั่วคราว (ออก `preflight_token` อายุ 10 นาที ผูกกับ belt_head + user) แต่ `/inspections/:id/results` และ `/submit` จะ**คำนวณระยะทางจาก lat/lng ที่แนบมาใหม่อีกครั้งที่ server เสมอ** ไม่เชื่อ preflight_token เพียงอย่างเดียว — ป้องกันกรณี mock GPS หลัง preflight ผ่านแล้ว

---

## 4. Threshold & Alert Flow
1. Operator กรอกค่าตัวเลข (เช่น อุณหภูมิ bearing, แรงดัน) → client ส่งไป `/inspections/:id/results`
2. Server เทียบกับ `threshold_min/max` ของ `checklist_item_defs` (ไม่ hard-code ใน frontend)
3. ถ้าเกิน → ตั้ง `threshold_breached=true`, สร้าง `notifications` row (channel=email และ line) → worker ส่งทันที (retry with backoff, log ผลใน `status`)
4. ผล Fail (pass_fail_na=fail) ถือเป็น critical เสมอ → แจ้งเตือนทันทีเช่นกัน

## 5. Offline Sync Flow (Operator)
1. เปิดแอป → login (ต้อง online ครั้งแรก, token cache ไว้)
2. Preflight GPS check — ต้อง online (เป็นการตรวจสิทธิ์เข้าถึง real-time)
3. เข้า checklist → กรอกผล/ถ่ายภาพ/voice-to-text → กด "บันทึก" : ถ้า online ส่งทันที, ถ้า offline เก็บใน IndexedDB queue (`status=offline_pending`) พร้อม timestamp อุปกรณ์
4. Service Worker ตรวจสถานะ network → กลับมาออนไลน์ → เรียก `/inspections/sync-batch` อัตโนมัติ ส่งทีละ item ตาม idempotency key → ลบออกจากคิวเมื่อ server ตอบ 200
5. รูปภาพ: เก็บเป็น Blob ใน IndexedDB ชั่วคราว → sync คู่กับผลตรวจ → อัปโหลดเข้า MinIO ผ่าน presigned URL แล้วลบ Blob local

---

เอกสารนี้เป็น baseline สำหรับโค้ดที่จะสร้างต่อไป (backend/, frontend/, docker-compose.yml, docs/)
