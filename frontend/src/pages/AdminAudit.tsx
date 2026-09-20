import { useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import NavBar from "../components/NavBar";

interface AuditLogEntry {
  id: string;
  action: string;
  actor?: { fullName: string; employeeCode: string } | null;
  targetType: string | null;
  targetId: string | null;
  ipAddress: string | null;
  metadata: unknown;
  createdAt: string;
}

export default function AdminAudit() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [actionFilter, setActionFilter] = useState("");

  async function load() {
    const qs = actionFilter ? `?action=${actionFilter}` : "";
    setLogs(await apiFetch<AuditLogEntry[]>(`/audit-logs${qs}`));
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionFilter]);

  const ACTIONS = [
    "login_success",
    "login_failed",
    "logout",
    "pin_change",
    "pin_reset",
    "user_create",
    "user_update",
    "user_suspend",
    "geofence_update",
    "geofence_check",
    "inspection_start",
    "inspection_submit",
    "inspection_sync",
    "export_download",
  ];

  return (
    <div className="min-h-screen bg-slate-950">
      <NavBar />
      <main className="p-4 max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-xl font-bold">Audit Log</h1>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm"
          >
            <option value="">ทุกประเภท</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="bg-slate-800 text-slate-400">
              <tr>
                <th className="text-left p-3">เวลา</th>
                <th className="text-left p-3">Action</th>
                <th className="text-left p-3">ผู้ทำรายการ</th>
                <th className="text-left p-3">Target</th>
                <th className="text-left p-3">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-slate-800">
                  <td className="p-3 text-slate-400">{new Date(l.createdAt).toLocaleString("th-TH")}</td>
                  <td className="p-3">{l.action}</td>
                  <td className="p-3">{l.actor ? `${l.actor.fullName} (${l.actor.employeeCode})` : "-"}</td>
                  <td className="p-3 text-slate-400">
                    {l.targetType ?? "-"} {l.targetId?.slice(0, 8) ?? ""}
                  </td>
                  <td className="p-3 text-slate-400">{l.ipAddress ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
