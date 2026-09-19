import { describe, it, expect, vi, beforeAll } from "vitest";
import request from "supertest";
import argon2 from "argon2";

// ---- Mock Prisma แบบ in-memory เพื่อรัน test โดยไม่ต้องพึ่ง PostgreSQL จริง ----
interface FakeUser {
  id: string;
  employeeCode: string;
  fullName: string;
  pinHash: string;
  role: "operator" | "engineer" | "admin";
  status: "active" | "suspended";
  tokenVersion: number;
  lastLoginAt: Date | null;
}

const usersById = new Map<string, FakeUser>();
const usersByCode = new Map<string, FakeUser>();

function seedUser(u: FakeUser) {
  usersById.set(u.id, u);
  usersByCode.set(u.employeeCode, u);
}

vi.mock("../lib/prisma", () => {
  return {
    prisma: {
      user: {
        findUnique: vi.fn(async ({ where }: any) => {
          if (where.id) return usersById.get(where.id) ?? null;
          if (where.employeeCode) return usersByCode.get(where.employeeCode) ?? null;
          return null;
        }),
        findUniqueOrThrow: vi.fn(async ({ where }: any) => {
          const u = usersById.get(where.id);
          if (!u) throw new Error("not found");
          return u;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const u = usersById.get(where.id);
          if (!u) throw new Error("not found");
          if (data.tokenVersion?.increment) u.tokenVersion += data.tokenVersion.increment;
          if (data.lastLoginAt) u.lastLoginAt = data.lastLoginAt;
          if (data.pinHash) u.pinHash = data.pinHash;
          if (data.status) u.status = data.status;
          if (data.role) u.role = data.role;
          return u;
        }),
        findMany: vi.fn(async () => Array.from(usersById.values())),
      },
      auditLog: { create: vi.fn(async () => ({})) },
    },
  };
});

let app: import("express").Express;

beforeAll(async () => {
  const operatorPinHash = await argon2.hash("1234", { type: argon2.argon2id });
  const adminPinHash = await argon2.hash("9999", { type: argon2.argon2id });
  const suspendedPinHash = await argon2.hash("5555", { type: argon2.argon2id });

  seedUser({
    id: "user-operator-1",
    employeeCode: "OPR001",
    fullName: "Test Operator",
    pinHash: operatorPinHash,
    role: "operator",
    status: "active",
    tokenVersion: 0,
    lastLoginAt: null,
  });
  seedUser({
    id: "user-admin-1",
    employeeCode: "ADM001",
    fullName: "Test Admin",
    pinHash: adminPinHash,
    role: "admin",
    status: "active",
    tokenVersion: 0,
    lastLoginAt: null,
  });
  seedUser({
    id: "user-suspended-1",
    employeeCode: "SUS001",
    fullName: "Suspended User",
    pinHash: suspendedPinHash,
    role: "operator",
    status: "suspended",
    tokenVersion: 0,
    lastLoginAt: null,
  });

  const { createApp } = await import("../app");
  app = createApp();
});

describe("POST /api/v1/auth/login", () => {
  it("logs in successfully with correct employeeCode + PIN", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ employeeCode: "OPR001", pin: "1234" });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.user.role).toBe("operator");
  });

  it("rejects an incorrect PIN with a generic error (no user enumeration)", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ employeeCode: "OPR001", pin: "0000" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_credentials");
  });

  it("rejects a non-existent employee code with the same generic error", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ employeeCode: "NOSUCH", pin: "1234" });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("invalid_credentials");
  });

  it("rejects login for a suspended user even with the correct PIN", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ employeeCode: "SUS001", pin: "5555" });
    expect(res.status).toBe(401);
  });

  it("rejects malformed request body (missing pin)", async () => {
    const res = await request(app).post("/api/v1/auth/login").send({ employeeCode: "OPR001" });
    expect(res.status).toBe(400);
  });
});

describe("Role-based access control", () => {
  async function loginAs(employeeCode: string, pin: string) {
    const res = await request(app).post("/api/v1/auth/login").send({ employeeCode, pin });
    return res.body.accessToken as string;
  }

  it("blocks unauthenticated requests to admin-only routes", async () => {
    const res = await request(app).get("/api/v1/users");
    expect(res.status).toBe(401);
  });

  it("blocks an operator from accessing admin-only /users route (403)", async () => {
    const token = await loginAs("OPR001", "1234");
    const res = await request(app).get("/api/v1/users").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("insufficient_role");
  });

  it("allows an admin to access /users route", async () => {
    const token = await loginAs("ADM001", "9999");
    const res = await request(app).get("/api/v1/users").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it("rejects requests with an invalid/garbage bearer token", async () => {
    const res = await request(app).get("/api/v1/users").set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });

  it("revokes all outstanding tokens after logout (tokenVersion bump)", async () => {
    const token = await loginAs("ADM001", "9999");
    const logoutRes = await request(app).post("/api/v1/auth/logout").set("Authorization", `Bearer ${token}`);
    expect(logoutRes.status).toBe(200);

    // token เดิมต้องใช้งานไม่ได้อีกต่อไปเพราะ tokenVersion ไม่ตรงกันแล้ว
    const res = await request(app).get("/api/v1/users").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("token_revoked");
  });
});
