import type { AuthUser } from "../types";

// เก็บ token ใน memory + sessionStorage เท่านั้น (ไม่ใช่แหล่งข้อมูลหลักของระบบ — เป็นแค่ session cache)
// ข้อมูลตรวจจริงทั้งหมดต้องผ่าน server เสมอ ตามข้อกำหนดห้ามใช้ local storage เป็นแหล่งข้อมูลหลัก
const ACCESS_TOKEN_KEY = "belt_check_access_token";
const REFRESH_TOKEN_KEY = "belt_check_refresh_token";
const USER_KEY = "belt_check_user";

export function getAccessToken(): string | null {
  return sessionStorage.getItem(ACCESS_TOKEN_KEY);
}
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}
export function getStoredUser(): AuthUser | null {
  const raw = sessionStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setSession(accessToken: string, refreshToken: string, user: AuthUser) {
  sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, body: any) {
    super(body?.error ?? `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

let refreshingPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (refreshingPromise) return refreshingPromise;
  refreshingPromise = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) throw new ApiError(401, { error: "no_refresh_token" });
    const res = await fetch("/api/v1/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) {
      clearSession();
      throw new ApiError(res.status, await res.json().catch(() => ({})));
    }
    const data = await res.json();
    sessionStorage.setItem(ACCESS_TOKEN_KEY, data.accessToken);
    return data.accessToken as string;
  })();
  try {
    return await refreshingPromise;
  } finally {
    refreshingPromise = null;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (!(options.body instanceof FormData) && options.body) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`/api/v1${path}`, { ...options, headers });

  if (res.status === 401 && retry && getRefreshToken()) {
    try {
      await refreshAccessToken();
      return apiFetch<T>(path, options, false);
    } catch {
      // fallthrough — ตกไป throw ด้านล่าง
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json();
}

export { ApiError };
