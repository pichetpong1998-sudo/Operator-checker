-- Hongsa Belt Inspection System — Initial schema migration
-- สร้างด้วยมือให้ตรงกับ prisma/schema.prisma (เทียบเท่าผลลัพธ์ของ `prisma migrate dev`)
-- ใช้กับ PostgreSQL 15+

-- ---------- Enums ----------
CREATE TYPE "UserRole" AS ENUM ('operator', 'engineer', 'admin');
CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended');
CREATE TYPE "ResultValue" AS ENUM ('pass', 'fail', 'na');
CREATE TYPE "InspectionStatus" AS ENUM ('in_progress', 'submitted', 'offline_pending', 'synced');
CREATE TYPE "SyncSource" AS ENUM ('web', 'offline_sync');
CREATE TYPE "ChecklistInputType" AS ENUM ('pass_fail_na', 'numeric');
CREATE TYPE "ChecklistCategory" AS ENUM (
  'drive_unit_1', 'drive_unit_2', 'drive_unit_3', 'drive_unit_4',
  'belt_cleaner_primary', 'belt_cleaner_secondary', 'impact_carry_return',
  'chute_dust', 'belt_condition', 'pulley_primary', 'pulley_secondary',
  'pulley_takeup', 'pulley_tail', 'crossbar_spillage'
);
CREATE TYPE "NotificationType" AS ENUM ('critical_fail', 'threshold_exceeded');
CREATE TYPE "NotificationChannel" AS ENUM ('email', 'line');
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'sent', 'failed');
CREATE TYPE "AuditAction" AS ENUM (
  'login_success', 'login_failed', 'logout', 'pin_change', 'pin_reset',
  'user_create', 'user_update', 'user_suspend', 'geofence_update',
  'geofence_check', 'inspection_start', 'inspection_submit',
  'inspection_sync', 'export_download'
);

-- ---------- users ----------
CREATE TABLE "users" (
  "id" TEXT NOT NULL,
  "employee_code" TEXT NOT NULL,
  "full_name" TEXT NOT NULL,
  "pin_hash" TEXT NOT NULL,
  "role" "UserRole" NOT NULL,
  "status" "UserStatus" NOT NULL DEFAULT 'active',
  "email" TEXT,
  "line_user_id" TEXT,
  "token_version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "last_login_at" TIMESTAMP(3),
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_employee_code_key" ON "users"("employee_code");

-- ---------- belt_heads ----------
CREATE TABLE "belt_heads" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "belt_heads_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "belt_heads_code_key" ON "belt_heads"("code");

-- ---------- geofences ----------
CREATE TABLE "geofences" (
  "id" TEXT NOT NULL,
  "belt_head_id" TEXT NOT NULL,
  "latitude" DECIMAL(10,7) NOT NULL,
  "longitude" DECIMAL(10,7) NOT NULL,
  "radius_m" INTEGER NOT NULL DEFAULT 50,
  "updated_by_id" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "geofences_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "geofences_belt_head_id_key" ON "geofences"("belt_head_id");
ALTER TABLE "geofences" ADD CONSTRAINT "geofences_belt_head_id_fkey"
  FOREIGN KEY ("belt_head_id") REFERENCES "belt_heads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "geofences" ADD CONSTRAINT "geofences_updated_by_id_fkey"
  FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------- checklist_item_defs ----------
CREATE TABLE "checklist_item_defs" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "category" "ChecklistCategory" NOT NULL,
  "label_th" TEXT NOT NULL,
  "label_en" TEXT NOT NULL,
  "input_type" "ChecklistInputType" NOT NULL,
  "unit" TEXT,
  "threshold_min" DECIMAL(10,3),
  "threshold_max" DECIMAL(10,3),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "checklist_item_defs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "checklist_item_defs_code_key" ON "checklist_item_defs"("code");

-- ---------- inspections ----------
CREATE TABLE "inspections" (
  "id" TEXT NOT NULL,
  "belt_head_id" TEXT NOT NULL,
  "operator_id" TEXT NOT NULL,
  "shift_name" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submitted_at" TIMESTAMP(3),
  "client_submitted_at" TIMESTAMP(3),
  "check_in_lat" DECIMAL(10,7) NOT NULL,
  "check_in_lng" DECIMAL(10,7) NOT NULL,
  "check_in_accuracy_m" DECIMAL(6,2) NOT NULL,
  "geofence_check_passed" BOOLEAN NOT NULL,
  "geofence_distance_m" DECIMAL(8,2) NOT NULL,
  "status" "InspectionStatus" NOT NULL DEFAULT 'in_progress',
  "sync_source" "SyncSource" NOT NULL DEFAULT 'web',
  "device_id" TEXT,
  "idempotency_key" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inspections_idempotency_key_key" ON "inspections"("idempotency_key");
CREATE INDEX "inspections_belt_head_id_created_at_idx" ON "inspections"("belt_head_id", "created_at");
CREATE INDEX "inspections_operator_id_created_at_idx" ON "inspections"("operator_id", "created_at");
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_belt_head_id_fkey"
  FOREIGN KEY ("belt_head_id") REFERENCES "belt_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_operator_id_fkey"
  FOREIGN KEY ("operator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------- inspection_results ----------
CREATE TABLE "inspection_results" (
  "id" TEXT NOT NULL,
  "inspection_id" TEXT NOT NULL,
  "checklist_item_id" TEXT NOT NULL,
  "result_value" "ResultValue",
  "numeric_value" DECIMAL(10,3),
  "threshold_breached" BOOLEAN NOT NULL DEFAULT false,
  "note_text" TEXT,
  "voice_transcript" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inspection_results_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "inspection_results_inspection_id_checklist_item_id_key"
  ON "inspection_results"("inspection_id", "checklist_item_id");
ALTER TABLE "inspection_results" ADD CONSTRAINT "inspection_results_inspection_id_fkey"
  FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inspection_results" ADD CONSTRAINT "inspection_results_checklist_item_id_fkey"
  FOREIGN KEY ("checklist_item_id") REFERENCES "checklist_item_defs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------- inspection_photos ----------
CREATE TABLE "inspection_photos" (
  "id" TEXT NOT NULL,
  "inspection_result_id" TEXT NOT NULL,
  "object_key" TEXT NOT NULL,
  "highlight_x" DOUBLE PRECISION,
  "highlight_y" DOUBLE PRECISION,
  "highlight_radius" DOUBLE PRECISION,
  "captured_at" TIMESTAMP(3),
  "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inspection_photos_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "inspection_photos" ADD CONSTRAINT "inspection_photos_inspection_result_id_fkey"
  FOREIGN KEY ("inspection_result_id") REFERENCES "inspection_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------- notifications ----------
CREATE TABLE "notifications" (
  "id" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "recipient" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "NotificationStatus" NOT NULL DEFAULT 'pending',
  "error_message" TEXT,
  "sent_at" TIMESTAMP(3),
  "related_inspection_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- ---------- audit_logs ----------
CREATE TABLE "audit_logs" (
  "id" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "action" "AuditAction" NOT NULL,
  "target_type" TEXT,
  "target_id" TEXT,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at");
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
