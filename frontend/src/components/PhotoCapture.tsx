import { useRef, useState } from "react";
import type { DraftPhoto } from "../types";

interface Props {
  onCapture: (photo: DraftPhoto) => void;
  photos: DraftPhoto[];
  onRemove: (localId: string) => void;
}

/**
 * ถ่ายภาพ (input capture="environment" เปิดกล้องหลังโดยตรงบนมือถือ) แล้ววาดวงกลม
 * ไฮไลต์ตำแหน่งจุดเสียบนรูปด้วย <canvas> — พิกัดเก็บเป็นสัดส่วน 0..1 ของขนาดรูป
 * เพื่อให้แสดงผลถูกต้องไม่ว่าจะ render ที่ขนาดใดก็ตาม
 */
export default function PhotoCapture({ onCapture, photos, onRemove }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImage, setPendingImage] = useState<{ url: string; blob: Blob } | null>(null);
  const [highlight, setHighlight] = useState<{ x: number; y: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPendingImage({ url, blob: file });
    setHighlight(null);
  }

  function handleImageClick(e: React.MouseEvent<HTMLImageElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setHighlight({ x, y });
  }

  function confirmPhoto() {
    if (!pendingImage) return;
    onCapture({
      localId: crypto.randomUUID(),
      blob: pendingImage.blob,
      highlightX: highlight?.x,
      highlightY: highlight?.y,
      highlightRadius: highlight ? 0.06 : undefined,
      capturedAt: new Date().toISOString(),
    });
    setPendingImage(null);
    setHighlight(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="rounded-lg bg-slate-700 px-4 py-3 text-sm font-semibold"
      >
        📷 ถ่ายภาพจุดเสีย
      </button>

      {pendingImage && (
        <div className="relative border border-slate-700 rounded-lg overflow-hidden">
          <img
            ref={imgRef}
            src={pendingImage.url}
            onClick={handleImageClick}
            className="w-full cursor-crosshair"
            alt="แตะบนรูปเพื่อวงกลมไฮไลต์ตำแหน่งเสีย"
          />
          {highlight && (
            <div
              className="absolute border-4 border-red-500 rounded-full pointer-events-none"
              style={{
                left: `calc(${highlight.x * 100}% - 24px)`,
                top: `calc(${highlight.y * 100}% - 24px)`,
                width: 48,
                height: 48,
              }}
            />
          )}
          <p className="text-xs text-slate-400 p-2">แตะบนรูปเพื่อวงกลมไฮไลต์ตำแหน่งที่เสีย (ไม่บังคับ)</p>
          <div className="flex gap-2 p-2">
            <button onClick={confirmPhoto} className="flex-1 rounded-lg bg-teal-600 py-2 text-sm font-semibold">
              ยืนยันรูปนี้
            </button>
            <button
              onClick={() => {
                setPendingImage(null);
                setHighlight(null);
              }}
              className="flex-1 rounded-lg bg-slate-700 py-2 text-sm"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <div key={p.localId} className="relative">
              <img src={URL.createObjectURL(p.blob)} className="rounded-lg aspect-square object-cover" alt="" />
              <button
                onClick={() => onRemove(p.localId)}
                className="absolute top-1 right-1 bg-black/70 rounded-full w-6 h-6 text-xs"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
