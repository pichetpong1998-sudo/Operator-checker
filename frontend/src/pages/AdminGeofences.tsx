import { useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import NavBar from "../components/NavBar";
import type { BeltHead } from "../types";

export default function AdminGeofences() {
  const [beltHeads, setBeltHeads] = useState<BeltHead[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ latitude: "", longitude: "", radiusM: "50" });
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setBeltHeads(await apiFetch<BeltHead[]>("/belt-heads"));
  }
  useEffect(() => {
    load();
  }, []);

  function startEdit(bh: BeltHead) {
    setEditing(bh.code);
    setForm({
      latitude: bh.geofence?.latitude ?? "",
      longitude: bh.geofence?.longitude ?? "",
      radiusM: String(bh.geofence?.radiusM ?? 50),
    });
    setMessage(null);
  }

  async function useCurrentLocation() {
    navigator.geolocation.getCurrentPosition((pos) => {
      setForm({
        latitude: pos.coords.latitude.toFixed(7),
        longitude: pos.coords.longitude.toFixed(7),
        radiusM: form.radiusM,
      });
    });
  }

  async function save(code: string) {
    setMessage(null);
    try {
      await apiFetch(`/belt-heads/${code}/geofence`, {
        method: "PUT",
        body: JSON.stringify({
          latitude: Number(form.latitude),
          longitude: Number(form.longitude),
          radiusM: Number(form.radiusM),
        }),
      });
      setEditing(null);
      await load();
    } catch (err: any) {
      setMessage(err?.body?.error ?? "บันทึกไม่สำเร็จ");
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <NavBar />
      <main className="p-4 max-w-3xl mx-auto space-y-4">
        <h1 className="text-xl font-bold">พิกัด GPS และรัศมี Geofence ของแต่ละหัวสายพาน</h1>
        <p className="text-sm text-slate-400">
          ค่าที่ตั้งไว้ที่นี่จะถูกใช้ร่วมกันโดยมือถือ Operator ทุกเครื่อง (เก็บในฐานข้อมูลกลาง)
        </p>

        <div className="space-y-3">
          {beltHeads.map((bh) => (
            <div key={bh.id} className="rounded-xl bg-slate-900 border border-slate-800 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-lg">{bh.code}</p>
                  {bh.geofence ? (
                    <p className="text-xs text-slate-400">
                      lat {bh.geofence.latitude}, lng {bh.geofence.longitude}, รัศมี {bh.geofence.radiusM} m
                    </p>
                  ) : (
                    <p className="text-xs text-amber-400">ยังไม่ได้ตั้งพิกัด</p>
                  )}
                </div>
                <button onClick={() => startEdit(bh)} className="rounded-lg bg-slate-800 px-3 py-2 text-sm">
                  แก้ไข
                </button>
              </div>

              {editing === bh.code && (
                <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      value={form.latitude}
                      onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                      placeholder="Latitude"
                      className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm"
                    />
                    <input
                      value={form.longitude}
                      onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                      placeholder="Longitude"
                      className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm"
                    />
                    <input
                      value={form.radiusM}
                      onChange={(e) => setForm({ ...form, radiusM: e.target.value })}
                      placeholder="รัศมี (m)"
                      className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={useCurrentLocation} className="rounded-lg bg-slate-800 px-3 py-2 text-xs">
                      ใช้ตำแหน่งปัจจุบันของอุปกรณ์นี้
                    </button>
                    <button onClick={() => save(bh.code)} className="rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold">
                      บันทึก
                    </button>
                    <button onClick={() => setEditing(null)} className="rounded-lg bg-slate-800 px-3 py-2 text-xs">
                      ยกเลิก
                    </button>
                  </div>
                  {message && <p className="text-red-400 text-xs">{message}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
