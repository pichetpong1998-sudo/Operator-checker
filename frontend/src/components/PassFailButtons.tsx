import type { ResultValue } from "../types";

interface Props {
  value?: ResultValue;
  onChange: (value: ResultValue) => void;
}

/**
 * ปุ่มขนาดใหญ่ คอนทราสต์สูง อ่านง่ายกลางแดด ตามข้อกำหนด Operator UX
 */
export default function PassFailButtons({ value, onChange }: Props) {
  const base = "big-tap-target flex-1 rounded-xl border-4 transition-colors";
  return (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={() => onChange("pass")}
        className={`${base} ${
          value === "pass" ? "bg-green-600 border-green-400 text-white" : "bg-slate-800 border-slate-700 text-green-400"
        }`}
      >
        PASS
      </button>
      <button
        type="button"
        onClick={() => onChange("fail")}
        className={`${base} ${
          value === "fail" ? "bg-red-600 border-red-400 text-white" : "bg-slate-800 border-slate-700 text-red-400"
        }`}
      >
        FAIL
      </button>
      <button
        type="button"
        onClick={() => onChange("na")}
        className={`${base} ${
          value === "na" ? "bg-slate-500 border-slate-300 text-white" : "bg-slate-800 border-slate-700 text-slate-400"
        }`}
      >
        N/A
      </button>
    </div>
  );
}
