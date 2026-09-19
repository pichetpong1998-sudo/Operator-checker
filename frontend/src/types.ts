export type UserRole = "operator" | "engineer" | "admin";

export interface AuthUser {
  id: string;
  employeeCode: string;
  fullName: string;
  role: UserRole;
}

export interface BeltHead {
  id: string;
  code: string;
  name: string;
  active: boolean;
  geofence: { latitude: string; longitude: string; radiusM: number } | null;
}

export type ChecklistInputType = "pass_fail_na" | "numeric";

export interface ChecklistItemDef {
  id: string;
  code: string;
  category: string;
  labelTh: string;
  labelEn: string;
  inputType: ChecklistInputType;
  unit: string | null;
  thresholdMin: string | null;
  thresholdMax: string | null;
  sortOrder: number;
}

export type ResultValue = "pass" | "fail" | "na";

export interface DraftResult {
  checklistItemId: string;
  resultValue?: ResultValue;
  numericValue?: number;
  noteText?: string;
  voiceTranscript?: string;
  photos?: DraftPhoto[];
}

export interface DraftPhoto {
  localId: string;
  blob: Blob;
  highlightX?: number;
  highlightY?: number;
  highlightRadius?: number;
  capturedAt: string;
}

export interface GpsSample {
  latitude: number;
  longitude: number;
  accuracyM: number;
}

/** รายการที่รอ sync ใน IndexedDB — ใช้เป็น "คิวชั่วคราว" เท่านั้น ไม่ใช่แหล่งข้อมูลหลักของระบบ */
export interface OfflineInspectionQueueItem {
  idempotencyKey: string;
  beltHeadCode: string;
  shiftName?: "day" | "night";
  deviceId: string;
  clientSubmittedAt: string;
  gps: GpsSample;
  results: DraftResult[];
  createdAt: string;
  syncAttempts: number;
  lastError?: string;
}
