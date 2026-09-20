import { useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import NavBar from "../components/NavBar";
import type { UserRole } from "../types";

interface AdminUser {
  id: string;
  employeeCode: string;
  fullName: string;
  role: UserRole;
  status: "active" | "suspended";
  email: string | null;
  lastLoginAt: string | null;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ employeeCode: "", fullName: "", role: "operator" as UserRole, pin: "", email: "" });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setUsers(await apiFetch<AdminUser[]>("/users"));
  }
  useEffect(() => {
    load();
  }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/users", { method: "POST", body: JSON.stringify(form) });
      setShowCreate(false);
      setForm({ employeeCode: "", fullName: "", role: "operator", pin: "", email: "" });
      await load();
    } catch (err: any) {
      setError(err?.body?.error ?? "สร้างผู้ใช้ไม่สำเร็จ");
    }
  }

  async function toggleSuspend(u: AdminUser) {
    const path = u.status === "active" ? `/users/${u.id}/suspend` : `/users/${u.id}/reactivate`;
    await apiFetch(path, { method: "POST" });
    await load();
  }

  async function resetPin(u: AdminUser) {
    const newPin = prompt(`ตั้ง PIN ใหม่สำหรับ ${u.fullName} (4-12 หลัก)`);
    if (!newPin) return;
    await apiFetch(`/users/${u.id}/reset-pin`, { method: "POST", body: JSON.stringify({ newPin }) });
    alert("รีเซ็ต PIN สำเร็จ — แจ้งพนักงานเข้าสู่ระบบใหม่");
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <NavBar />
      <main className="p-4 max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">จัดการผู้ใช้งาน</h1>
          <button onClick={() => setShowCreate((v) => !v)} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold">
            + สร้างผู้ใช้ใหม่
          </button>
        </div>

        {showCreate && (
          <form onSubmit={createUser} className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                placeholder="รหัสพนักงาน"
                value={form.employeeCode}
                onChange={(e) => setForm({ ...form, employeeCode: e.target.value })}
                className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2"
              />
              <input
                required
                placeholder="ชื่อ-นามสกุล"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2"
              />
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2"
              >
                <option value="operator">Operator</option>
                <option value="engineer">Engineer</option>
                <option value="admin">Admin</option>
              </select>
              <input
                required
                placeholder="PIN เริ่มต้น (4-12 หลัก)"
                value={form.pin}
                onChange={(e) => setForm({ ...form, pin: e.target.value })}
                className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2"
              />
              <input
                placeholder="อีเมล (สำหรับแจ้งเตือน)"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 col-span-2"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button type="submit" className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold">
              บันทึก
            </button>
          </form>
        )}

        <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-slate-400">
              <tr>
                <th className="text-left p-3">รหัส</th>
                <th className="text-left p-3">ชื่อ</th>
                <th className="text-left p-3">Role</th>
                <th className="text-left p-3">สถานะ</th>
                <th className="text-left p-3">เข้าระบบล่าสุด</th>
                <th className="text-left p-3">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-slate-800">
                  <td className="p-3">{u.employeeCode}</td>
                  <td className="p-3">{u.fullName}</td>
                  <td className="p-3 capitalize">{u.role}</td>
                  <td className="p-3">
                    <span className={u.status === "active" ? "text-green-400" : "text-red-400"}>{u.status}</span>
                  </td>
                  <td className="p-3 text-slate-400">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("th-TH") : "-"}
                  </td>
                  <td className="p-3 flex gap-2">
                    <button onClick={() => resetPin(u)} className="text-teal-400 underline text-xs">
                      Reset PIN
                    </button>
                    <button onClick={() => toggleSuspend(u)} className="text-amber-400 underline text-xs">
                      {u.status === "active" ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
