import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiFetch } from "../api/client";
import type { ChecklistItemDef, DraftPhoto, DraftResult, GpsSample, OfflineInspectionQueueItem, ResultValue } from "../types";
import PassFailButtons from "../components/PassFailButtons";
import PhotoCapture from "../components/PhotoCapture";
import VoiceInput from "../components/VoiceInput";
import GeoStatus from "../components/GeoStatus";
import { enqueueInspection, savePhotoBlob } from "../db/offlineQueue";
import { runSync } from "../sync/syncEngine";

type Phase = "gps_check" | "checklist" | "submitting" | "done";

function getGpsSample(): Promise<GpsSample> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("geolocation_unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
        }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

function getDeviceId(): string {
  const KEY = "belt_check_device_id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}

export default function ChecklistPage() {
  const { beltHeadCode } = useParams<{ beltHeadCode: string }>();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>("gps_check");
  const [geoState, setGeoState] = useState<{ status: "checking" | "allowed" | "denied"; distanceM?: number | null; reason?: string }>({
    status: "checking",
  });
  const [gpsSample, setGpsSample] = useState<GpsSample | null>(null);

  const [items, setItems] = useState<ChecklistItemDef[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftResult>>({});
  const [error, setError] = useState<string | null>(null);
  const [online] = useState(navigator.onLine);

  useEffect(() => {
    apiFetch<ChecklistItemDef[]>("/checklist-items").then(setItems).catch(() => setItems([]));
  }, []);

  async function runPreflight() {
    if (!beltHeadCode) return;
    setGeoState({ status: "checking" });
    try {
      const gps = await getGpsSample();
      setGpsSample(gps);

      if (!online) {
        // Offline: ไม่สามารถขอ preflight token จาก server ได้ — อนุญาตให้กรอกในเครื่องก่อน
        // แต่ server จะตรวจ geofence ซ้ำอย่างเข้มงวดตอน sync เสมอ (อาจถูกปฏิเสธภายหลังถ้าอยู่นอกรัศมีจริง)
        setGeoState({ status: "allowed", distanceM: null });
        setPhase("checklist");
        return;
      }

      const res = await apiFetch<{ allowed: boolean; distanceM: number; reason?: string }>("/preflight/gps-check", {
        method: "POST",
        body: JSON.stringify({ beltHeadCode, latitude: gps.latitude, longitude: gps.longitude, accuracyM: gps.accuracyM }),
      });
      setGeoState({ status: "allowed", distanceM: res.distanceM });
      setPhase("checklist");
    } catch (err: any) {
      if (err?.body) {
        setGeoState({ status: "denied", distanceM: err.body.distanceM, reason: err.body.reason });
      } else {
        setGeoState({ status: "denied", reason: "gps_error" });
      }
    }
  }

  useEffect(() => {
    runPreflight();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beltHeadCode]);

  function updateDraft(itemId: string, patch: Partial<DraftResult>) {
    setDrafts((prev) => ({
      ...prev,
      [itemId]: { ...prev[itemId], checklistItemId: itemId, ...patch },
    }));
  }

  const groupedItems = useMemo(() => items, [items]);
  const failCount = Object.values(drafts).filter((d) => d.resultValue === "fail").length;
  const answeredCount = Object.values(drafts).filter((d) => d.resultValue || d.numericValue !== undefined).length;

  async function handleSubmit() {
    if (!beltHeadCode || !gpsSample) return;
    setPhase("submitting");
    setError(null);

    const resultsArray = Object.values(drafts);

    try {
      if (online) {
        // ออนไลน์: ส่งตรงเข้า server ทันที — server ตรวจ geofence ซ้ำก่อนรับผลตรวจทุกครั้ง
        const freshGps = await getGpsSample().catch(() => gpsSample);
        const inspection = await apiFetch<{ id: string }>("/inspections", {
          method: "POST",
          body: JSON.stringify({
            beltHeadCode,
            deviceId: getDeviceId(),
            idempotencyKey: crypto.randomUUID(),
            gps: freshGps,
          }),
        });

        const resultsRes = await apiFetch<{ results: Array<{ id: string; checklistItemId: string }> }>(
          `/inspections/${inspection.id}/results`,
          {
            method: "POST",
            body: JSON.stringify({
              gps: freshGps,
              results: resultsArray.map((r) => ({
                checklistItemId: r.checklistItemId,
                resultValue: r.resultValue,
                numericValue: r.numericValue,
                noteText: r.noteText,
                voiceTranscript: r.voiceTranscript,
              })),
            }),
          }
        );

        // อัปโหลดรูป (ถ้ามี) ผ่าน presigned URL โดยอ้างอิง inspectionResultId จริงที่ server สร้างให้
        const resultIdByItem = new Map(resultsRes.results.map((r) => [r.checklistItemId, r.id]));
        for (const r of resultsArray) {
          const inspectionResultId = resultIdByItem.get(r.checklistItemId);
          if (!inspectionResultId) continue;
          for (const photo of r.photos ?? []) {
            await uploadPhoto(inspectionResultId, photo).catch((e) => console.error("photo upload failed", e));
          }
        }

        await apiFetch(`/inspections/${inspection.id}/submit`, { method: "POST" });
      } else {
        // ออฟไลน์: เก็บลง IndexedDB queue ชั่วคราว — sync อัตโนมัติเมื่อกลับมาออนไลน์
        const idempotencyKey = crypto.randomUUID();
        for (const r of resultsArray) {
          for (const photo of r.photos ?? []) {
            await savePhotoBlob(photo.localId, photo.blob);
          }
        }
        const queueItem: OfflineInspectionQueueItem = {
          idempotencyKey,
          beltHeadCode,
          deviceId: getDeviceId(),
          clientSubmittedAt: new Date().toISOString(),
          gps: gpsSample,
          results: resultsArray,
          createdAt: new Date().toISOString(),
          syncAttempts: 0,
        };
        await enqueueInspection(queueItem);
        runSync().catch(() => undefined); // เผื่อกลับมาออนไลน์ระหว่างนี้พอดี
      }

      setPhase("done");
    } catch (err: any) {
      setError(err?.body?.error ?? err?.message ?? "เกิดข้อผิดพลาด");
      setPhase("checklist");
    }
  }

  async function uploadPhoto(inspectionResultId: string, photo: DraftPhoto) {
    const presign = await apiFetch<{ uploadUrl: string; objectKey: string }>("/uploads/presign", {
      method: "POST",
      body: JSON.stringify({ inspectionResultId, contentType: (photo.blob.type || "image/jpeg") as any }),
    });
    await fetch(presign.uploadUrl, { method: "PUT", body: photo.blob, headers: { "Content-Type": photo.blob.type } });
    await apiFetch(`/uploads/inspection-results/${inspectionResultId}/photos`, {
      method: "POST",
      body: JSON.stringify({
        objectKey: presign.objectKey,
        highlightX: photo.highlightX,
        highlightY: photo.highlightY,
        highlightRadius: photo.highlightRadius,
        capturedAt: photo.capturedAt,
      }),
    });
  }

  if (phase === "gps_check" || geoState.status === "checking") {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 gap-4">
        <h1 className="text-xl font-bold">{beltHeadCode}</h1>
        <GeoStatus status="checking" />
      </div>
    );
  }

  if (geoState.status === "denied") {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 gap-4">
        <h1 className="text-xl font-bold">{beltHeadCode}</h1>
        <GeoStatus status="denied" distanceM={geoState.distanceM} reason={geoState.reason} />
        <button onClick={runPreflight} className="big-tap-target w-full rounded-xl bg-teal-600 max-w-sm">
          ลองตรวจสอบตำแหน่งอีกครั้ง
        </button>
        <button onClick={() => navigate(-1)} className="text-slate-400 underline text-sm">
          กลับ
        </button>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 gap-4 text-center">
        <h1 className="text-2xl font-bold text-green-400">บันทึกผลตรวจสำเร็จ</h1>
        <p className="text-slate-400">{online ? "ส่งข้อมูลเข้าระบบเรียบร้อย" : "บันทึกไว้ในเครื่อง รอ sync อัตโนมัติ"}</p>
        <button onClick={() => navigate("/operator")} className="big-tap-target w-full rounded-xl bg-teal-600 max-w-sm">
          กลับหน้าหลัก
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 pb-32">
      <header className="p-4 border-b border-slate-800 sticky top-0 bg-slate-950 z-10">
        <h1 className="text-xl font-bold">{beltHeadCode}</h1>
        <p className="text-xs text-slate-400">
          ตอบแล้ว {answeredCount}/{groupedItems.length} รายการ
          {failCount > 0 && <span className="text-red-400 ml-2">Fail {failCount} รายการ</span>}
        </p>
      </header>

      <main className="p-4 space-y-5">
        {groupedItems.map((item) => {
          const draft = drafts[item.id] ?? { checklistItemId: item.id };
          return (
            <div key={item.id} className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-3">
              <p className="font-semibold">{item.labelTh}</p>

              {item.inputType === "pass_fail_na" ? (
                <PassFailButtons
                  value={draft.resultValue}
                  onChange={(v: ResultValue) => updateDraft(item.id, { resultValue: v })}
                />
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={draft.numericValue ?? ""}
                    onChange={(e) => updateDraft(item.id, { numericValue: e.target.value === "" ? undefined : Number(e.target.value) })}
                    className="flex-1 rounded-lg bg-slate-800 border border-slate-700 px-4 py-3 text-lg"
                    placeholder="กรอกค่า"
                  />
                </div>
              )}

              {draft.resultValue === "fail" && (
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <textarea
                    value={draft.noteText ?? ""}
                    onChange={(e) => updateDraft(item.id, { noteText: e.target.value })}
                    placeholder="อธิบายลักษณะความเสียหาย..."
                    className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm"
                    rows={2}
                  />
                  <VoiceInput onTranscript={(text) => updateDraft(item.id, { voiceTranscript: text, noteText: (draft.noteText ?? "") + " " + text })} />
                  <PhotoCapture
                    photos={draft.photos ?? []}
                    onCapture={(photo) => updateDraft(item.id, { photos: [...(draft.photos ?? []), photo] })}
                    onRemove={(id) => updateDraft(item.id, { photos: (draft.photos ?? []).filter((p) => p.localId !== id) })}
                  />
                </div>
              )}
            </div>
          );
        })}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 p-4 bg-slate-950 border-t border-slate-800">
        {error && <p className="text-red-400 text-sm mb-2 text-center">{error}</p>}
        <button
          onClick={handleSubmit}
          disabled={answeredCount === 0 || (phase as Phase) === "submitting"}
          className="big-tap-target w-full rounded-xl bg-teal-600 disabled:opacity-50"
        >
          {phase === "submitting" ? "กำลังบันทึก..." : "บันทึกผลตรวจ"}
        </button>
      </footer>
    </div>
  );
}
