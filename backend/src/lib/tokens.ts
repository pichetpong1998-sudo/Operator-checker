import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import type { UserRole } from "@prisma/client";

export interface AccessTokenPayload {
  sub: string; // user id
  employeeCode: string;
  role: UserRole;
  tokenVersion: number;
  type: "access";
}

export interface RefreshTokenPayload {
  sub: string;
  tokenVersion: number;
  type: "refresh";
}

export function signAccessToken(payload: Omit<AccessTokenPayload, "type">): string {
  return jwt.sign({ ...payload, type: "access" }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as SignOptions["expiresIn"],
  });
}

export function signRefreshToken(payload: Omit<RefreshTokenPayload, "type">): string {
  return jwt.sign({ ...payload, type: "refresh" }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL as SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
  if (decoded.type !== "access") throw new Error("Invalid token type");
  return decoded;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
  if (decoded.type !== "refresh") throw new Error("Invalid token type");
  return decoded;
}

/**
 * ออก preflight token ชั่วคราว (อายุสั้น) หลังผ่านการตรวจ GPS/geofence
 * ใช้เป็น "ตั๋ว" เปิด checklist บน client เท่านั้น — server ยัง validate geofence ซ้ำเสมอ
 * ที่ /inspections endpoints ไม่ได้เชื่อ token นี้แทนการตรวจจริง
 */
export interface PreflightTokenPayload {
  sub: string;
  beltHeadId: string;
  type: "preflight";
}

export function signPreflightToken(payload: Omit<PreflightTokenPayload, "type">): string {
  return jwt.sign({ ...payload, type: "preflight" }, env.JWT_ACCESS_SECRET, {
    expiresIn: `${env.PREFLIGHT_TOKEN_TTL_MIN}m` as SignOptions["expiresIn"],
  });
}

export function verifyPreflightToken(token: string): PreflightTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as PreflightTokenPayload;
  if (decoded.type !== "preflight") throw new Error("Invalid token type");
  return decoded;
}
