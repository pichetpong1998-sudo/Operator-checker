import { useEffect, useState } from "react";
import { apiFetch } from "../api/client";
import NavBar from "../components/NavBar";
import type { ChecklistInputType, ChecklistItemDef } from "../types";

const CATEGORIES = [
  "drive_unit_1", "drive_unit_2", "drive_unit_3", "drive_unit_4",
  "belt_cleaner_primary", "belt_cleaner_secondary", "impact_carry_return",
  "chute_dust", "belt_condition", "pulley_primary", "pulley_secondary",
  "pulley_takeup", "pulley_tail", "crossbar_spillage",
];
const CATEGORY_LABEL: Record<string, string> = {
  drive_unit_1: "Drive Unit 1", drive_unit_2: "Drive Unit 2", drive_unit_3: "Drive Unit 3", drive_unit_4: "Drive Unit 4",
  belt_cleaner_primary: "Belt Cleaner (Primary)", belt_cleaner_secondary: "Belt Cleaner (Secondary)",
  impact_carry_return: "Impact / Carry / Return", chute_dust: "Chute / Dust", belt_condition: "สภาพสายพาน",
  pulley_primary: "Pulley (Primary)", pulley_secondary: "Pulley (Secondary)", pulley_takeup: "Pulley (Takeup)",
  pulley_tail: "Pulley (Tail)", crossbar_spillage: "Crossbar / Spillage",
};

interface AdminChecklistItem extends ChecklistItemDef {
  active: boolean;
}

const emptyForm = {
  code: "",
  category: CATEGORIES[0],
  labelTh: "",
  labelEn: "",
  inputType: "pass_fail_na" as ChecklistInputType,
  unit: "",
  thresholdMin: "",
  thresholdMax: "",
};

export default function AdminChecklistItems() {
  const [items, setItems] = useState<AdminChecklistItem[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setItems(await apiFetch<AdminChecklistItem[]>("/checklist-items/all"));
  }
  useEffect(() => {
    load();
  }, []);

  async function createItem(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/checklist-items", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          unit: form.unit || undefined,
          thresholdMin: form.thresholdMin ? Number(form.thresholdMin) : undefined,
          thresholdMax: form.thresholdMax ? Number(form.thresholdMax) : undefined,
        }),
      });
      setShowCreate(false);
      setForm(emptyForm);
      await load();
    } catch (err: any) {
      setError(err?.body?.error ?? "สร้างรายการไม่สำเร็จ (รหัส/code อาจซ้ำ)");
    }
  }

  async function saveItem(item: AdminChecklistItem) {
    setSavingId(item.id);
    try {
      await apiFetch(`/checklist-items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          labelTh: item.labelTh,
          labelEn: item.labelEn,
          category: item.category,
          inputType: item.inputType,
          unit: item.unit || null,
          thresholdMin: item.thresholdMin !== null ? Number(item.thresholdMin) : null,
          thresholdMax: item.thresholdMax !== null ? Number(item.thresholdMax) : null,
        }),
      });
      await load();
    } finally {
      setSavingId(null);
    }
  }

  async function toggleActive(item: AdminChecklistItem) {
    await apiFetch(`/checklist-items/${item.id}`, { method: "PATCH", body: JSON.stringify({ active: !item.active }) });
    await load();
  }

  function updateLocal(id: string, patch: Partial<AdminChecklistItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  const grouped = CATEGORIES.map((cat) => ({ cat, rows: items.filter((i) => i.category === cat) })).filter(
    (g) => g.rows.length > 0
  );

  return (
    <div className="min-h-screen bg-slate-950">
      <NavBar />
      <main className="p-4 max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">จัดการรายการตรวจเช็ค</h1>
          <button onClick={() => setShowCreate((v) => !v)} className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold">
            + เพิ่มรายการตรวจใหม่
          </button>
        </div>

        <p className="text-xs text-slate-500">
          แก้ไขแล้วกด "บันทึก" ในแต่ละแถว — การปิดใช้งาน (แทนการลบ) จะไม่กระทบประวัติการตรวจเก่าที่มีอยู่แล้ว
        </p>

        {showCreate && (
          <form onSubmit={createItem} className="rounded-xl bg-slate-900 border border-slate-800 p-4 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <input
                required
                placeholder="Code (เช่น DRIVE_1_OIL)"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2"
              />
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
              <select
                value={form.inputType}
                onChange={(e) => setForm({ ...form, inputType: e.target.value as ChecklistInputType })}
                className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2"
              >
                <option value="pass_fail_na">Pass / Fail / N/A</option>
                <option value="numeric">ค่าตัวเลข</option>
              </select>
              <input
                required
                placeholder="ชื่อรายการ (ไทย)"
                value={form.labelTh}
                onChange={(e) => setForm({ ...form, labelTh: e.target.value })}
                className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2"
              />
              <input
                required
                placeholder="Label (English)"
                value={form.labelEn}
                onChange={(e) => setForm({ ...form, labelEn: e.target.value })}
                className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2"
              />
              {form.inputType === "numeric" && (
                <>
                  <input
                    placeholder="หน่วย (เช่น %, mm, °C)"
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2"
                  />
                  <input
                    placeholder="เกณฑ์ต่ำสุด"
                    type="number"
                    value={form.thresholdMin}
                    onChange={(e) => setForm({ ...form, thresholdMin: e.target.value })}
                    className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2"
                  />
                  <input
                    placeholder="เกณฑ์สูงสุด"
                    type="number"
                    value={form.thresholdMax}
                    onChange={(e) => setForm({ ...form, thresholdMax: e.target.value })}
                    className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2"
                  />
                </>
              )}
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button type="submit" className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold">
              บันทึก
            </button>
          </form>
        )}

        {grouped.map(({ cat, rows }) => (
          <div key={cat} className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
            <div className="bg-slate-800 px-3 py-2 text-sm font-semibold text-teal-400">{CATEGORY_LABEL[cat]}</div>
            <table className="w-full text-sm">
              <thead className="bg-slate-800/50 text-slate-400">
                <tr>
                  <th className="text-left p-2">ชื่อรายการ (ไทย)</th>
                  <th className="text-left p-2">Label (EN)</th>
                  <th className="text-left p-2">ประเภท</th>
                  <th className="text-left p-2">หน่วย</th>
                  <th className="text-left p-2">Min</th>
                  <th className="text-left p-2">Max</th>
                  <th className="text-left p-2">สถานะ</th>
                  <th className="text-left p-2">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => (
                  <tr key={item.id} className={`border-t border-slate-800 ${!item.active ? "opacity-40" : ""}`}>
                    <td className="p-2">
                      <input
                        value={item.labelTh}
                        onChange={(e) => updateLocal(item.id, { labelTh: e.target.value })}
                        className="w-full rounded bg-slate-800 border border-slate-700 px-2 py-1"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        value={item.labelEn}
                        onChange={(e) => updateLocal(item.id, { labelEn: e.target.value })}
                        className="w-full rounded bg-slate-800 border border-slate-700 px-2 py-1"
                      />
                    </td>
                    <td className="p-2">
                      <select
                        value={item.inputType}
                        onChange={(e) => updateLocal(item.id, { inputType: e.target.value as ChecklistInputType })}
                        className="rounded bg-slate-800 border border-slate-700 px-2 py-1"
                      >
                        <option value="pass_fail_na">Pass/Fail</option>
                        <option value="numeric">ตัวเลข</option>
                      </select>
                    </td>
                    <td className="p-2">
                      <input
                        value={item.unit ?? ""}
                        onChange={(e) => updateLocal(item.id, { unit: e.target.value })}
                        className="w-16 rounded bg-slate-800 border border-slate-700 px-2 py-1"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        value={item.thresholdMin ?? ""}
                        onChange={(e) => updateLocal(item.id, { thresholdMin: e.target.value as any })}
                        className="w-16 rounded bg-slate-800 border border-slate-700 px-2 py-1"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="number"
                        value={item.thresholdMax ?? ""}
                        onChange={(e) => updateLocal(item.id, { thresholdMax: e.target.value as any })}
                        className="w-16 rounded bg-slate-800 border border-slate-700 px-2 py-1"
                      />
                    </td>
                    <td className="p-2">
                      <span className={item.active ? "text-green-400" : "text-red-400"}>
                        {item.active ? "ใช้งาน" : "ปิดใช้งาน"}
                      </span>
                    </td>
                    <td className="p-2 flex gap-2">
                      <button
                        onClick={() => saveItem(item)}
                        disabled={savingId === item.id}
                        className="text-teal-400 underline text-xs"
                      >
                        บันทึก
                      </button>
                      <button onClick={() => toggleActive(item)} className="text-amber-400 underline text-xs">
                        {item.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </main>
    </div>
  );
}
