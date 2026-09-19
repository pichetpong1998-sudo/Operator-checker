import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../state/AuthContext";

export default function Login() {
  const { loginWithPin } = useAuth();
  const navigate = useNavigate();
  const [employeeCode, setEmployeeCode] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginWithPin(employeeCode.trim().toUpperCase(), pin);
      navigate("/", { replace: true });
    } catch {
      setError("รหัสพนักงานหรือ PIN ไม่ถูกต้อง");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-slate-950">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-1">ระบบตรวจเช็คหัวสายพาน</h1>
        <p className="text-center text-slate-400 mb-8">โครงการเหมืองหงสา สปป.ลาว</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1 text-slate-300">รหัสพนักงาน</label>
            <input
              autoFocus
              value={employeeCode}
              onChange={(e) => setEmployeeCode(e.target.value)}
              className="w-full rounded-lg bg-slate-800 border border-slate-700 px-4 py-4 text-xl tracking-wide"
              placeholder="เช่น OPR001"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-sm mb-1 text-slate-300">PIN</label>
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="w-full rounded-lg bg-slate-800 border border-slate-700 px-4 py-4 text-xl tracking-widest"
              placeholder="••••"
              autoComplete="current-password"
            />
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || !employeeCode || !pin}
            className="big-tap-target w-full rounded-xl bg-teal-600 active:bg-teal-700 disabled:opacity-50 disabled:active:bg-teal-600"
          >
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>
      </div>
    </div>
  );
}
