import fs from 'node:fs';
import path from 'node:path';
import { config, ROOT, langName, LANGUAGES } from './config';
import { llmJson } from './llm';
import { sarvamOn, translateText } from './sarvam';
import { addMessage, languagesInDeal, store } from './store';
import type { ChatMessage, LangCode } from '../../shared/types';

const STYLE: Partial<Record<LangCode, string>> = {
  bgc: 'Haryanvi as spoken in Rohtak and Sonipat, written in Devanagari, informal and warm',
  hi: 'plain spoken Hindi in Devanagari',
  ta: 'plain spoken Tamil',
  te: 'plain spoken Telugu',
  mr: 'plain spoken Marathi',
  pa: 'plain spoken Punjabi in Gurmukhi',
  bn: 'plain spoken Bengali',
  gu: 'plain spoken Gujarati',
  kn: 'plain spoken Kannada',
};

const RULES = 'Translate for small shop owners who may not read much. Short, spoken words, no jargon. Keep numbers, names, currency symbols and product names exactly as written. Do not add or remove information.';

/** Translate one message into several languages. Returns only the languages that worked. */
export async function translateMany(text: string, from: LangCode, targets: LangCode[]): Promise<Partial<Record<LangCode, string>>> {
  const want = targets.filter(t => t !== from);
  if (!want.length || !text.trim()) return {};
  if (sarvamOn()) {
    // One call per distinct Sarvam language. Haryanvi and Hindi share hi-IN.
    const codeOf = (l: LangCode) => (l === 'bgc' ? 'hi' : l);
    const uniq = [...new Set(want.map(codeOf))];
    const got = await Promise.all(uniq.map(async u => [u, await translateText(text, from, u)] as const));
    const byCode = new Map(got);
    const res: Partial<Record<LangCode, string>> = {};
    for (const t of want) { const v = byCode.get(codeOf(t)); if (v) res[t] = v; }
    return res;
  }
  const spec = want.map(t => `"${t}": ${STYLE[t] ?? langName(t)}`).join('\n');
  const out = await llmJson<Record<string, string>>({
    fast: true,
    maxTokens: 900,
    system: `${RULES} Reply with one JSON object whose keys are the language codes requested and whose values are the translations.`,
    user: `Source language: ${langName(from)}\nText: ${text}\n\nTranslate into:\n${spec}`,
  });
  const res: Partial<Record<LangCode, string>> = {};
  if (out) for (const t of want) if (typeof out[t] === 'string' && out[t].trim()) res[t] = out[t].trim();
  return res;
}

/** Post a message and fill in translations for everyone in the deal. Preset translations skip the model. */
export async function postMessage(p: {
  dealId: string; from: ChatMessage['from']; buyerId?: string; sellerId?: string; text: string; lang: LangCode;
  translations?: ChatMessage['translations'];
}, commit: () => void): Promise<ChatMessage> {
  const msg = addMessage({ ...p, translations: { ...(p.translations ?? {}) } });
  commit();
  const need = languagesInDeal(p.dealId).filter(l => l !== p.lang && !msg.translations[l]);
  if (need.length) {
    const got = await translateMany(p.text, p.lang, need);
    Object.assign(msg.translations, got);
    commit();
  }
  return msg;
}

// ---- UI string translation with a disk cache ----

const cacheFile = path.join(config.dataDir, 'i18n-cache.json');
let cache: Record<string, Record<string, string>> = {};
try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { /* none yet */ }
// Warmed translations shipped with the code, so a redeploy never has to pay for them again.
try {
  const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'server', 'seed', 'i18n.json'), 'utf8')) as Record<string, Record<string, string>>;
  for (const [lang, map] of Object.entries(seed)) cache[lang] = { ...map, ...(cache[lang] ?? {}) };
} catch { /* no seed */ }
export const i18nCache = () => cache;
const saveCache = () => { try { fs.mkdirSync(config.dataDir, { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify(cache)); } catch { /* ignore */ } };

export async function translateStrings(lang: LangCode, strings: Record<string, string>, budgetMs = 20000): Promise<Record<string, string>> {
  if (lang === 'en') return strings;
  const have = (cache[lang] ??= {});
  const missing = Object.entries(strings).filter(([k, v]) => have[`${k}|${v}`] === undefined);
  if (sarvamOn()) {
    // Placeholders like {n} become numbers the translator leaves alone, then are put back. If any is lost, keep English.
    const todo = [...missing];
    const until = Date.now() + budgetMs;
    const worker = async () => {
      for (let it = todo.pop(); it; it = Date.now() < until ? todo.pop() : undefined) {
        const [k, v] = it;
        const holders: string[] = [];
        const masked = v.replace(/\{(\w+)\}/g, (_m, name) => { holders.push(name); return String(7000 + holders.length); });
        const out = await translateText(masked, 'en', lang === 'bgc' ? 'hi' : lang);
        if (!out) continue;
        let back = out;
        let ok = true;
        holders.forEach((name, i) => { const tok = String(7001 + i); if (!back.includes(tok)) ok = false; back = back.split(tok).join(`{${name}}`); });
        if (ok) have[`${k}|${v}`] = back;
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    if (missing.length) saveCache();
    const res: Record<string, string> = {};
    let pending = 0;
    for (const [k, v] of Object.entries(strings)) { res[k] = have[`${k}|${v}`] ?? v; if (have[`${k}|${v}`] === undefined) pending++; }
    if (pending) res.__pending = String(pending);
    return res;
  }
  const BATCH = 40;
  for (let i = 0; i < missing.length; i += BATCH) {
    const part = Object.fromEntries(missing.slice(i, i + BATCH));
    const out = await llmJson<Record<string, string>>({
      fast: true,
      maxTokens: 2500,
      system: `${RULES} These are button labels and short lines of an app. Keep them short. Keep {placeholders} exactly. Reply with one JSON object with the same keys and the translated values.`,
      user: `Translate into ${STYLE[lang] ?? langName(lang)}:\n${JSON.stringify(part)}`,
    });
    if (out) for (const [k, v] of Object.entries(part)) if (typeof out[k] === 'string' && out[k].trim()) have[`${k}|${v}`] = out[k].trim();
  }
  if (missing.length) saveCache();
  const res: Record<string, string> = {};
  for (const [k, v] of Object.entries(strings)) res[k] = have[`${k}|${v}`] ?? v;
  return res;
}

export const isLang = (x: unknown): x is LangCode => typeof x === 'string' && LANGUAGES.some(l => l.code === x);
export const buyerLangs = () => store.buyers.map(b => b.lang);
