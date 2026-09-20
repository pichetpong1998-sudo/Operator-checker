import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/client";
import { useAuth } from "../state/AuthContext";
import type { BeltHead } from "../types";
import { queueLength, listQueuedInspections } from "../db/offlineQueue";
import { runSync } from "../sync/syncEngine";

export default function OperatorHome() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [beltHeads, setBeltHeads] = useState<BeltHead[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    apiFetch<BeltHead[]>("/belt-heads")
      .then(setBeltHeads)
      .catch(() => setBeltHeads([]));
    refreshQueue();

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  async function refreshQueue() {
    setPendingCount(await queueLength());
  }

  async function handleManualSync() {
    setSyncing(true);
    await runSync().catch(() => undefined);
    await refreshQueue();
    setSyncing(false);
  }

  return (
    <div className="min-h-screen bg-slate-950 pb-8">
      <header className="p-4 flex items-center justify-between border-b border-slate-800">
        <div>
          <p className="text-sm text-slate-400">สวัสดี</p>
          <p className="font-semibold text-lg">{user?.fullName}</p>
        </div>
        <button onClick={() => logout().then(() => navigate("/login"))} className="text-sm text-slate-400 underline">
          ออกจากระบบ
        </button>
      </header>

      <div className={`px-4 py-2 text-sm ${online ? "bg-green-900/40 text-green-300" : "bg-amber-900/40 text-amber-300"}`}>
        {online ? "● ออนไลน์" : "● ออฟไลน์ — บันทึกผลไว้ในเครื่อง รอ sync อัตโนมัติเมื่อกลับมาออนไลน์"}
      </div>

      {pendingCount > 0 && (
        <div className="mx-4 mt-3 rounded-lg bg-slate-900 border border-amber-700 p-3 flex items-center justify-between">
          <span className="text-sm text-amber-300">รอ sync {pendingCount} รายการ</span>
          <button
            onClick={handleManualSync}
            disabled={syncing || !online}
            className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {syncing ? "กำลัง sync..." : "Sync ตอนนี้"}
          </button>
        </div>
      )}

      <main className="p-4">
        <h2 className="text-sm text-slate-400 mb-3">เลือกหัวสายพานที่จะตรวจ</h2>
        <div className="grid grid-cols-2 gap-3">
          {beltHeads.map((bh) => (
            <button
              key={bh.id}
              onClick={() => navigate(`/operator/checklist/${bh.code}`)}
              className="big-tap-target rounded-xl bg-slate-800 border-2 border-slate-700 active:border-teal-500 flex flex-col items-center justify-center"
            >
              <span className="text-2xl">{bh.code}</span>
              <span className="text-xs text-slate-400 mt-1">{bh.name}</span>
            </button>
          ))}
          {beltHeads.length === 0 && (
            <p className="col-span-2 text-slate-500 text-sm text-center py-8">
              กำลังโหลดรายการหัวสายพาน... (ต้องออนไลน์อย่างน้อยครั้งแรก)
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
