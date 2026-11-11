import { config, aiProvider } from './config';

interface Req { system: string; user: string; fast?: boolean; json?: boolean; maxTokens?: number }

const cache = new Map<string, string>();

/** One place that talks to a language model. Returns null when no key is set or the call fails,
 *  so every caller must have a plain-code fallback. */
export async function llm(req: Req): Promise<string | null> {
  const provider = aiProvider();
  if (!provider) return null;
  const key = `${req.fast}|${req.system}|${req.user}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30000);
  try {
    let out: string | null = null;
    if (provider === 'sarvam') {
      const r = await fetch('https://api.sarvam.ai/v1/chat/completions', {
        method: 'POST',
        signal: ctl.signal,
        headers: { 'content-type': 'application/json', 'api-subscription-key': config.ai.sarvamKey, authorization: `Bearer ${config.ai.sarvamKey}` },
        body: JSON.stringify({
          model: config.ai.sarvamModel,
          max_tokens: req.maxTokens ?? 600,
          temperature: 0.2,
          messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.user }],
        }),
      });
      if (!r.ok) throw new Error(`sarvam ${r.status} ${await r.text()}`);
      const j: any = await r.json();
      out = (j.choices?.[0]?.message?.content ?? null)?.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim() || null;
    } else if (provider === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: ctl.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': config.ai.anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: req.fast ? config.ai.anthropicFast : config.ai.anthropicModel,
          max_tokens: req.maxTokens ?? 600,
          system: req.system,
          messages: [{ role: 'user', content: req.user }],
        }),
      });
      if (!r.ok) throw new Error(`anthropic ${r.status} ${await r.text()}`);
      const j: any = await r.json();
      out = j.content?.map((c: any) => c.text ?? '').join('') ?? null;
    } else {
      const r = await fetch(`${config.ai.openaiBase}/chat/completions`, {
        method: 'POST',
        signal: ctl.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.ai.openaiKey}` },
        body: JSON.stringify({
          model: config.ai.openaiModel,
          max_tokens: req.maxTokens ?? 600,
          messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.user }],
          ...(req.json ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
      if (!r.ok) throw new Error(`openai ${r.status} ${await r.text()}`);
      const j: any = await r.json();
      out = j.choices?.[0]?.message?.content ?? null;
    }
    if (out) cache.set(key, out);
    return out;
  } catch (e) {
    console.warn('[llm] failed:', (e as Error).message.slice(0, 200));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function llmJson<T>(req: Omit<Req, 'json'>): Promise<T | null> {
  const raw = await llm({ ...req, json: true });
  if (!raw) return null;
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as T; } catch { return null; }
}
