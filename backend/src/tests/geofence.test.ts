import { describe, it, expect } from "vitest";
import { evaluateGeofence, haversineDistanceMeters } from "../lib/geo";

describe("haversineDistanceMeters", () => {
  it("returns ~0 for identical coordinates", () => {
    const d = haversineDistanceMeters(19.91, 101.25, 19.91, 101.25);
    expect(d).toBeCloseTo(0, 3);
  });

  it("returns a plausible distance for two nearby points (~157m apart)", () => {
    // 0.0015 deg latitude ~ 166m; ใช้เป็น sanity check ระยะทางคร่าวๆ
    const d = haversineDistanceMeters(19.91, 101.25, 19.9115, 101.25);
    expect(d).toBeGreaterThan(140);
    expect(d).toBeLessThan(180);
  });
});

describe("evaluateGeofence — GPS accuracy gate", () => {
  const base = {
    fenceLat: 19.91,
    fenceLng: 101.25,
    fenceRadiusM: 50,
    maxAccuracyM: 35,
  };

  it("rejects when reported accuracy exceeds MAX_GPS_ACCURACY_M (35m)", () => {
    const result = evaluateGeofence({
      ...base,
      deviceLat: 19.91,
      deviceLng: 101.25,
      deviceAccuracyM: 40, // เกิน 35m
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("accuracy_too_low");
  });

  it("accepts when accuracy exactly at the limit and device is at the fence center", () => {
    const result = evaluateGeofence({
      ...base,
      deviceLat: 19.91,
      deviceLng: 101.25,
      deviceAccuracyM: 35,
    });
    expect(result.allowed).toBe(true);
  });
});

describe("evaluateGeofence — radius gate", () => {
  const base = {
    fenceLat: 19.91,
    fenceLng: 101.25,
    fenceRadiusM: 50,
    maxAccuracyM: 35,
  };

  it("allows device standing at the exact geofence center", () => {
    const result = evaluateGeofence({ ...base, deviceLat: 19.91, deviceLng: 101.25, deviceAccuracyM: 10 });
    expect(result.allowed).toBe(true);
    expect(result.distanceM).toBeCloseTo(0, 1);
  });

  it("rejects a device far outside the radius + accuracy margin (~1km away)", () => {
    const result = evaluateGeofence({ ...base, deviceLat: 19.92, deviceLng: 101.25, deviceAccuracyM: 10 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("outside_radius");
  });

  it("allows a device just inside radius+accuracy margin near the edge", () => {
    // รัศมี 50m + accuracy 10m = margin 60m ที่ยอมรับได้
    // ~0.0004 deg latitude ≈ 44m จากจุดศูนย์กลาง — อยู่ในระยะที่ยอมรับ
    const result = evaluateGeofence({ ...base, deviceLat: 19.9104, deviceLng: 101.25, deviceAccuracyM: 10 });
    expect(result.allowed).toBe(true);
  });

  it("rejects a device just beyond radius+accuracy margin", () => {
    // ~0.001 deg latitude ≈ 111m — เกิน margin 60m
    const result = evaluateGeofence({ ...base, deviceLat: 19.911, deviceLng: 101.25, deviceAccuracyM: 10 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("outside_radius");
  });
});
