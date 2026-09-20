import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/client";
import NavBar from "../components/NavBar";

interface BeltStatus {
  beltHeadCode: string;
  status: "ready" | "warning" | "down" | "no_data";
  lastInspectionAt: string | null;
  lastOperator?: string;
  inspectionId?: string;
}

interface ShiftProgress {
  totalBeltHeads: number;
  inspectedCount: number;
  progressPercent: number;
}

const STATUS_STYLE: Record<string, string> = {
  ready: "bg-green-900/40 border-green-700 text-green-300",
  warning: "bg-amber-900/40 border-amber-700 text-amber-300",
  down: "bg-red-900/40 border-red-700 text-red-300",
  no_data: "bg-slate-900 border-slate-700 text-slate-500",
};

const STATUS_LABEL: Record<string, string> = {
  ready: "Ready",
  warning: "Warning",
  down: "Down",
  no_data: "ไม่มีข้อมูล",
};

export default function EngineerDashboard() {
  const [statuses, setStatuses] = useState<BeltStatus[]>([]);
  const [progress, setProgress] = useState<ShiftProgress | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [s, p] = await Promise.all([
      apiFetch<BeltStatus[]>("/dashboard/status"),
      apiFetch<ShiftProgress>("/dashboard/shift-progress"),
    ]);
    setStatuses(s);
    setProgress(p);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000); // refresh อัตโนมัติทุก 1 นาที
    return () => clearInterval(interval);
  }, []);

  async function exportFile(format: "xlsx" | "pdf") {
    const res = await fetch(`/api/v1/exports/inspections.${format}`, {
      headers: { Authorization: `Bearer ${sessionStorage.getItem("belt_check_access_token")}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inspections.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <NavBar />
      <main className="p-4 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Dashboard สถานะหัวสายพาน</h1>
          <div className="flex gap-2">
            <button onClick={() => exportFile("xlsx")} className="rounded-lg bg-slate-800 px-3 py-2 text-sm">
              Export Excel
            </button>
            <button onClick={() => exportFile("pdf")} className="rounded-lg bg-slate-800 px-3 py-2 text-sm">
              Export PDF
            </button>
          </div>
        </div>

        {progress && (
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-4">
            <p className="text-sm text-slate-400 mb-2">
              ความคืบหน้าการตรวจกะปัจจุบัน: {progress.inspectedCount}/{progress.totalBeltHeads} หัว
            </p>
            <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-teal-500" style={{ width: `${progress.progressPercent}%` }} />
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-slate-500">กำลังโหลด...</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {statuses.map((s) => (
              <Link
                key={s.beltHeadCode}
                to={`/dashboard/belt/${s.beltHeadCode}`}
                className={`rounded-xl border-2 p-4 block transition hover:scale-[1.02] hover:brightness-110 cursor-pointer ${STATUS_STYLE[s.status]}`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-lg font-bold">{s.beltHeadCode}</p>
                  <span className="text-xs opacity-60">ดูรายละเอียด →</span>
                </div>
                <p className="text-sm font-semibold">{STATUS_LABEL[s.status]}</p>
                {s.lastInspectionAt && (
                  <p className="text-xs mt-2 opacity-80">
                    ล่าสุด: {new Date(s.lastInspectionAt).toLocaleString("th-TH")}
                    {s.lastOperator && <> โดย {s.lastOperator}</>}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
