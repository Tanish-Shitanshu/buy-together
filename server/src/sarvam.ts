import { config, SARVAM_CODE } from './config';

const BASE = 'https://api.sarvam.ai';
const key = () => ({ 'api-subscription-key': config.ai.sarvamKey });
/** Last problem seen from the language service (status and a short message, never keys). For health checks. */
export const sarvamLast: { at?: number; status?: number; msg?: string } = {};
export const sarvamOn = () => Boolean(config.ai.sarvamKey);

/** Text translation (Mayura, spoken style). Returns null on any failure. */
export async function translateText(text: string, from: string, to: string): Promise<string | null> {
  if (!sarvamOn()) return null;
  const src = SARVAM_CODE[from] ?? from;
  const tgt = SARVAM_CODE[to] ?? to;
  if (src === tgt) return text;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(`${BASE}/translate`, {
        method: 'POST',
        headers: { ...key(), 'content-type': 'application/json' },
        body: JSON.stringify({
          input: text.slice(0, 1000), source_language_code: src, target_language_code: tgt,
          model: 'mayura:v1', mode: 'modern-colloquial', numerals_format: 'international',
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) { sarvamLast.at = Date.now(); sarvamLast.status = r.status; sarvamLast.msg = (await r.clone().text()).slice(0, 200); }
      if (r.status === 429 || r.status >= 500) {
        // Busy: wait a little longer each time, then try again.
        const wait = Number(r.headers.get('retry-after')) * 1000 || 700 * (attempt + 1) + Math.random() * 400;
        await new Promise(res => setTimeout(res, Math.min(wait, 4000)));
        continue;
      }
      if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 160)}`);
      const j: any = await r.json();
      return typeof j.translated_text === 'string' && j.translated_text.trim() ? j.translated_text.trim() : null;
    } catch (e) {
      if (attempt === 3) { console.warn('[sarvam] translate failed', (e as Error).message); return null; }
      await new Promise(res => setTimeout(res, 500 * (attempt + 1)));
    }
  }
  return null;
}

/** Speech to text (Saaras). `lang` is one of our codes; audio is whatever the browser recorded. */
export async function speechToText(audio: Buffer, mime: string, lang: string): Promise<{ text: string; lang: string } | null> {
  if (!sarvamOn()) return null;
  try {
    const form = new FormData();
    const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : mime.includes('wav') ? 'wav' : 'webm';
    form.append('file', new Blob([new Uint8Array(audio)], { type: mime }), `speech.${ext}`);
    form.append('model', 'saaras:v4');
    form.append('language_code', lang === 'auto' ? 'unknown' : SARVAM_CODE[lang] ?? 'unknown');
    const r = await fetch(`${BASE}/speech-to-text`, { method: 'POST', headers: key(), body: form, signal: AbortSignal.timeout(25000) });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 160)}`);
    const j: any = await r.json();
    return { text: String(j.transcript ?? '').trim(), lang: j.language_code ?? '' };
  } catch (e) {
    console.warn('[sarvam] stt failed', (e as Error).message);
    return null;
  }
}

/** Text to speech (Bulbul). Returns base64 WAV. */
export async function textToSpeech(text: string, lang: string): Promise<string | null> {
  if (!sarvamOn()) return null;
  const code = SARVAM_CODE[lang] ?? 'en-IN';
  try {
    const r = await fetch(`${BASE}/text-to-speech`, {
      method: 'POST',
      headers: { ...key(), 'content-type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 2400), target_language_code: code, language_code: code, model: 'bulbul:v3', speaker: 'ritu', output_audio_codec: 'wav' }),
      signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 160)}`);
    const j: any = await r.json();
    return j.audios?.[0] ?? null;
  } catch (e) {
    console.warn('[sarvam] tts failed', (e as Error).message);
    return null;
  }
}
