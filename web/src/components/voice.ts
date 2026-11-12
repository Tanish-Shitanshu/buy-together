import { useCallback, useRef, useState } from 'react';

/** Voice in: records with the microphone and sends audio to the server (Sarvam Saaras), which hears
 *  Indian languages well. Falls back to the browser's own speech recognition when the server has no key. */
export function useListen(lang: string, speechLang: string, server: boolean) {
  const [on, setOn] = useState(false);
  const rec = useRef<any>(null);
  const media = useRef<MediaRecorder | null>(null);
  const supported = typeof window !== 'undefined' && (server ? Boolean(navigator.mediaDevices?.getUserMedia) : Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));

  const start = useCallback(async (onText: (t: string, final: boolean, lang?: string) => void) => {
    if (server) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mr = new MediaRecorder(stream);
        const chunks: Blob[] = [];
        mr.ondataavailable = e => e.data.size && chunks.push(e.data);
        mr.onstop = async () => {
          stream.getTracks().forEach(t => t.stop());
          setOn(false);
          const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
          try {
            const r = await fetch(`/api/stt?lang=${encodeURIComponent(lang)}`, { method: 'POST', headers: { 'content-type': blob.type }, body: blob });
            const j = await r.json();
            if (r.ok && j.text) onText(j.text, true, j.lang);
          } catch { /* ignore */ }
        };
        media.current = mr;
        mr.start();
        setOn(true);
        setTimeout(() => { if (mr.state === 'recording') mr.stop(); }, 12000);
      } catch { setOn(false); }
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    rec.current?.stop?.();
    const r = new SR();
    r.lang = speechLang;
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e: any) => { const res = e.results[e.results.length - 1]; onText(res[0].transcript, res.isFinal); };
    r.onend = () => setOn(false);
    r.onerror = () => setOn(false);
    rec.current = r;
    setOn(true);
    r.start();
  }, [lang, speechLang, server]);

  const stop = useCallback(() => {
    if (media.current?.state === 'recording') media.current.stop();
    rec.current?.stop?.();
    setOn(false);
  }, []);
  return { on, supported, start, stop };
}

let current: HTMLAudioElement | null = null;
export function stopSpeaking() { current?.pause(); current = null; try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } }

/** Voice out: Sarvam Bulbul through the server, browser voice as fallback. */
export async function speak(text: string, lang: string, speechLang: string, server: boolean) {
  stopSpeaking();
  if (server) {
    try {
      const r = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, lang }) });
      const j = await r.json();
      if (r.ok && j.audio) { current = new Audio(`data:audio/wav;base64,${j.audio}`); await current.play(); return; }
    } catch { /* fall through */ }
  }
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = speechLang;
    window.speechSynthesis.speak(u);
  } catch { /* ignore */ }
}
