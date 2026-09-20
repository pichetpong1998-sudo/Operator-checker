import { useRef, useState } from "react";

interface Props {
  onTranscript: (text: string) => void;
}

// ใช้ Web Speech API (SpeechRecognition) — รองรับใน Chrome/Android โดยตรง
// iOS Safari ยังไม่รองรับเต็มรูปแบบ จึงมี fallback เป็นการพิมพ์ข้อความปกติเสมอ (ดูใน ChecklistPage)
export default function VoiceInput({ onTranscript }: Props) {
  const [listening, setListening] = useState(false);
  const [supported] = useState(() => "webkitSpeechRecognition" in window || "SpeechRecognition" in window);
  const recognitionRef = useRef<any>(null);

  function start() {
    const SpeechRecognitionCtor = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "th-TH";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      onTranscript(text);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  function stop() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={listening ? stop : start}
      className={`rounded-full px-4 py-3 text-sm font-semibold ${
        listening ? "bg-red-600 animate-pulse" : "bg-slate-700"
      }`}
    >
      {listening ? "● กำลังฟัง... (แตะเพื่อหยุด)" : "🎤 พูดเพื่อบันทึกข้อความ"}
    </button>
  );
}
