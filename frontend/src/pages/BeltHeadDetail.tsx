import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "../api/client";
import NavBar from "../components/NavBar";
import type { ChecklistItemDef } from "../types";

interface InspectionResultRow {
  id: string;
  resultValue: "pass" | "fail" | "na" | null;
  numericValue: string | null;
  thresholdBreached: boolean;
  noteText: string | null;
  checklistItem: ChecklistItemDef;
  photos: { id: string }[];
}

interface InspectionRow {
  id: string;
  createdAt: string;
  status: string;
  operator: { fullName: string; employeeCode: string };
  results: InspectionResultRow[];
}

type OverallStatus = "ready" | "warning" | "down";

const STATUS_STYLE: Record<OverallStatus, string> = {
  ready: "bg-green-900/40 border-green-700 text-green-300",
  warning: "bg-amber-900/40 border-amber-700 text-amber-300",
  down: "bg-red-900/40 border-red-700 text-red-300",
};
const STATUS_LABEL: Record<OverallStatus, string> = { ready: "Ready", warning: "Warning", down: "Down" };
const STATUS_DOT: Record<OverallStatus, string> = { ready: "bg-green-500", warning: "bg-amber-500", down: "bg-red-500" };

function overallStatus(results: InspectionResultRow[]): OverallStatus {
  if (results.some((r) => r.resultValue === "fail")) return "down";
  if (results.some((r) => r.thresholdBreached)) return "warning";
  return "ready";
}

export default function BeltHeadDetail() {
  const { code } = useParams<{ code: string }>();
  const [inspections, setInspections] = useState<InspectionRow[]>([]);
  const [items, setItems] = useState<ChecklistItemDef[]>([]);
  const [trends, setTrends] = useState<Record<string, { timestamp: string; numericValue: string | null }[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) return;
    setLoading(true);
    (async () => {
      const [insp, checklistItems] = await Promise.all([
        apiFetch<InspectionRow[]>(`/inspections?beltHeadCode=${encodeURIComponent(code)}`),
        apiFetch<ChecklistItemDef[]>("/checklist-items"),
      ]);
      setInspections(insp);
      setItems(checklistItems);

      const numericItems = checklistItems.filter((i) => i.inputType === "numeric");
      const trendEntries = await Promise.all(
        numericItems.map(async (item) => {
          const data = await apiFetch<{ timestamp: string; numericValue: string | null }[]>(
            `/dashboard/trends?checklistItemCode=${encodeURIComponent(item.code)}&beltHeadCode=${encodeURIComponent(code)}&days=30`
          );
          return [item.code, data] as const;
        })
      );
      setTrends(Object.fromEntries(trendEntries));
      setLoading(false);
    })();
  }, [code]);

  const status = inspections.length > 0 ? overallStatus(inspections[0].results) : null;
  const lastInspection = inspections[0];

  const passRate = useMemo(() => {
    if (inspections.length === 0) return null;
    const readyCount = inspections.filter((i) => overallStatus(i.results) === "ready").length;
    return Math.round((readyCount / inspections.length) * 100);
  }, [inspections]);

  const numericItems = items.filter((i) => i.inputType === "numeric");

  async function viewPhoto(photoId: string) {
    try {
      const { url } = await apiFetch<{ url: string }>(`/uploads/photos/${photoId}/view-url`);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      alert("เปิดรูปไม่สำเร็จ (อาจยังไม่ได้ตั้งค่าระบบเก็บรูปภาพ)");
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <NavBar />
      <main className="p-4 max-w-5xl mx-auto space-y-6">
        <Link to="/dashboard" className="text-sm text-slate-400 hover:text-teal-400">
          ← กลับไป Dashboard
        </Link>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">หัวสายพาน {code}</h1>
            {lastInspection && (
              <p className="text-sm text-slate-400 mt-1">
                ตรวจล่าสุด: {new Date(lastInspection.createdAt).toLocaleString("th-TH")} โดย {lastInspection.operator.fullName}
              </p>
            )}
          </div>
          {status && (
            <span className={`rounded-full border-2 px-4 py-1.5 font-semibold ${STATUS_STYLE[status]}`}>
              {STATUS_LABEL[status]}
            </span>
          )}
        </div>

        {loading ? (
          <p className="text-slate-500">กำลังโหลด...</p>
        ) : inspections.length === 0 ? (
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-6 text-center text-slate-500">
            ยังไม่มีประวัติการตรวจของหัวสายพานนี้
          </div>
        ) : (
          <>
            {/* สรุปสถิติ */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="rounded-xl bg-slate-900 border border-slate-800 p-4">
                <p className="text-xs text-slate-500">จำนวนรอบตรวจ (ล่าสุด)</p>
                <p className="text-2xl font-bold mt-1">{inspections.length}</p>
              </div>
              <div className="rounded-xl bg-slate-900 border border-slate-800 p-4">
                <p className="text-xs text-slate-500">อัตราผ่าน (Ready)</p>
                <p className="text-2xl font-bold mt-1">{passRate}%</p>
              </div>
              <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 col-span-2 md:col-span-1">
                <p className="text-xs text-slate-500 mb-2">แนวโน้ม 20 รอบล่าสุด</p>
                <div className="flex gap-1 flex-wrap">
                  {inspections
                    .slice(0, 20)
                    .reverse()
                    .map((insp) => {
                      const s = overallStatus(insp.results);
                      return (
                        <span
                          key={insp.id}
                          title={`${new Date(insp.createdAt).toLocaleString("th-TH")} — ${STATUS_LABEL[s]}`}
                          className={`h-4 w-4 rounded-sm ${STATUS_DOT[s]}`}
                        />
                      );
                    })}
                </div>
              </div>
            </div>

            {/* กราฟแนวโน้มค่าตัวเลข */}
            {numericItems.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3">แนวโน้มค่าตัวเลข (30 วันล่าสุด)</h2>
                <div className="grid md:grid-cols-2 gap-4">
                  {numericItems.map((item) => {
                    const data = (trends[item.code] ?? [])
                      .filter((d) => d.numericValue != null)
                      .map((d) => ({
                        ts: new Date(d.timestamp).toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit" }),
                        value: Number(d.numericValue),
                      }));
                    const min = item.thresholdMin != null ? Number(item.thresholdMin) : undefined;
                    const max = item.thresholdMax != null ? Number(item.thresholdMax) : undefined;
                    return (
                      <div key={item.code} className="rounded-xl bg-slate-900 border border-slate-800 p-4">
                        <p className="text-sm font-semibold mb-2">
                          {item.labelTh} {item.unit && <span className="text-slate-500">({item.unit})</span>}
                        </p>
                        {data.length === 0 ? (
                          <p className="text-xs text-slate-600 py-8 text-center">ยังไม่มีข้อมูลตัวเลขในช่วงนี้</p>
                        ) : (
                          <ResponsiveContainer width="100%" height={180}>
                            <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                              <XAxis dataKey="ts" tick={{ fontSize: 11, fill: "#64748b" }} />
                              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} domain={["auto", "auto"]} />
                              <Tooltip
                                contentStyle={{ background: "#0f172a", border: "1px solid #334155", fontSize: 12 }}
                                labelStyle={{ color: "#94a3b8" }}
                              />
                              {min != null && (
                                <ReferenceLine y={min} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "min", fontSize: 10, fill: "#f59e0b" }} />
                              )}
                              {max != null && (
                                <ReferenceLine y={max} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "max", fontSize: 10, fill: "#f59e0b" }} />
                              )}
                              <Line type="monotone" dataKey="value" stroke="#2dd4bf" strokeWidth={2} dot={{ r: 3 }} />
                            </LineChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ประวัติการตรวจล่าสุด */}
            <div>
              <h2 className="text-lg font-semibold mb-3">ประวัติการตรวจล่าสุด</h2>
              <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800/50 text-slate-400 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium">เวลา</th>
                      <th className="px-3 py-2 font-medium">ผู้ตรวจ</th>
                      <th className="px-3 py-2 font-medium">สถานะ</th>
                      <th className="px-3 py-2 font-medium">Fail / Warning — รายละเอียด</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspections.slice(0, 30).map((insp) => {
                      const s = overallStatus(insp.results);
                      const failItems = insp.results.filter((r) => r.resultValue === "fail");
                      const warnItems = insp.results.filter((r) => r.thresholdBreached && r.resultValue !== "fail");
                      return (
                        <tr key={insp.id} className="border-t border-slate-800">
                          <td className="px-3 py-2 whitespace-nowrap">{new Date(insp.createdAt).toLocaleString("th-TH")}</td>
                          <td className="px-3 py-2">{insp.operator.fullName}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[s]}`}>
                              {STATUS_LABEL[s]}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {[...failItems, ...warnItems].length === 0 ? (
                              <span className="text-slate-400">—</span>
                            ) : (
                              <div className="space-y-1.5">
                                {[...failItems, ...warnItems].map((r) => (
                                  <div key={r.id} className="flex items-start gap-2">
                                    <span
                                      className={`shrink-0 rounded px-1.5 py-0.5 font-semibold ${
                                        r.resultValue === "fail"
                                          ? "bg-red-900/40 text-red-300"
                                          : "bg-amber-900/40 text-amber-300"
                                      }`}
                                    >
                                      {r.checklistItem.labelTh}
                                    </span>
                                    {r.noteText && <span className="text-slate-300">{r.noteText}</span>}
                                    {r.photos.length > 0 && (
                                      <button
                                        onClick={() => viewPhoto(r.photos[0].id)}
                                        className="shrink-0 text-teal-400 underline"
                                      >
                                        ดูรูป{r.photos.length > 1 ? ` (${r.photos.length})` : ""}
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
