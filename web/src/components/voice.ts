import { useCallback, useRef, useState } from 'react';

/** Browser speech: free, no key. Support varies, so every caller must work without it. */
export function useListen(speechLang: string) {
  const [on, setOn] = useState(false);
  const rec = useRef<any>(null);
  const supported = typeof window !== 'undefined' && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const start = useCallback((onText: (t: string, final: boolean) => void) => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    rec.current?.stop?.();
    const r = new SR();
    r.lang = speechLang;
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e: any) => {
      const res = e.results[e.results.length - 1];
      onText(res[0].transcript, res.isFinal);
    };
    r.onend = () => setOn(false);
    r.onerror = () => setOn(false);
    rec.current = r;
    setOn(true);
    r.start();
  }, [speechLang]);
  const stop = useCallback(() => { rec.current?.stop?.(); setOn(false); }, []);
  return { on, supported, start, stop };
}

export function speak(text: string, speechLang: string) {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = speechLang;
    window.speechSynthesis.speak(u);
  } catch { /* ignore */ }
}
