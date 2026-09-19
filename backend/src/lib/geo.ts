/**
 * คำนวณระยะทางระหว่างสองพิกัด GPS ด้วยสูตร Haversine
 * คืนค่าเป็นเมตร
 */
export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // รัศมีโลกโดยประมาณ (เมตร)
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export interface GeofenceCheckInput {
  deviceLat: number;
  deviceLng: number;
  deviceAccuracyM: number;
  fenceLat: number;
  fenceLng: number;
  fenceRadiusM: number;
  maxAccuracyM: number;
}

export interface GeofenceCheckResult {
  allowed: boolean;
  distanceM: number;
  reason?: "accuracy_too_low" | "outside_radius";
}

/**
 * ตรรกะตรวจ Geofence กลาง — ใช้ทั้งที่ /preflight/gps-check และ
 * ซ้ำอีกครั้งที่ /inspections/:id/results และ /submit เสมอ (ห้ามเชื่อ client)
 */
export function evaluateGeofence(input: GeofenceCheckInput): GeofenceCheckResult {
  const { deviceLat, deviceLng, deviceAccuracyM, fenceLat, fenceLng, fenceRadiusM, maxAccuracyM } =
    input;

  if (deviceAccuracyM > maxAccuracyM) {
    return { allowed: false, distanceM: NaN, reason: "accuracy_too_low" };
  }

  const distanceM = haversineDistanceMeters(deviceLat, deviceLng, fenceLat, fenceLng);

  // อนุญาตเผื่อ margin เท่ากับ GPS accuracy ที่รายงานมา (ลด false-reject ใกล้ขอบรัศมี)
  const effectiveRadius = fenceRadiusM + Math.min(deviceAccuracyM, maxAccuracyM);

  if (distanceM > effectiveRadius) {
    return { allowed: false, distanceM, reason: "outside_radius" };
  }

  return { allowed: true, distanceM };
}
