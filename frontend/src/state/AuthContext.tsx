import { createContext, useContext, useState, type ReactNode } from "react";
import { apiFetch, setSession, clearSession, getStoredUser } from "../api/client";
import type { AuthUser } from "../types";

interface AuthContextValue {
  user: AuthUser | null;
  loginWithPin: (employeeCode: string, pin: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser());

  async function loginWithPin(employeeCode: string, pin: string) {
    const res = await apiFetch<{ accessToken: string; refreshToken: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ employeeCode, pin }),
    });
    setSession(res.accessToken, res.refreshToken, res.user);
    setUser(res.user);
  }

  async function logout() {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // เพิกเฉยถ้า offline — ยังเคลียร์ session ฝั่ง client ได้
    }
    clearSession();
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, loginWithPin, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
