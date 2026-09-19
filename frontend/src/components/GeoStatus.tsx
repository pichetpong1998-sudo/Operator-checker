interface Props {
  status: "checking" | "allowed" | "denied" | "idle";
  distanceM?: number | null;
  reason?: string;
}

const LABELS: Record<string, { text: string; color: string }> = {
  checking: { text: "กำลังตรวจสอบตำแหน่ง GPS...", color: "text-amber-400" },
  allowed: { text: "อยู่ในรัศมีที่กำหนด — เปิด Checklist ได้", color: "text-green-400" },
  denied: { text: "อยู่นอกรัศมี หรือ GPS ไม่แม่นยำพอ", color: "text-red-400" },
  idle: { text: "รอการตรวจสอบตำแหน่ง", color: "text-slate-400" },
};

export default function GeoStatus({ status, distanceM, reason }: Props) {
  const info = LABELS[status];
  return (
    <div className="rounded-lg bg-slate-900 border border-slate-800 p-3 text-sm">
      <p className={`font-semibold ${info.color}`}>{info.text}</p>
      {distanceM != null && <p className="text-slate-400 mt-1">ระยะห่างจากหัวสายพาน: {distanceM} เมตร</p>}
      {reason === "accuracy_too_low" && (
        <p className="text-slate-400 mt-1">สัญญาณ GPS ไม่แม่นยำพอ กรุณาออกไปที่โล่งแจ้งแล้วลองใหม่</p>
      )}
      {reason === "outside_radius" && <p className="text-slate-400 mt-1">กรุณาเข้าใกล้หัวสายพานมากขึ้น</p>}
    </div>
  );
}
