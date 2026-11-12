import { sarvamLast } from './sarvam';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { config, LANGUAGES } from './config';
import * as engine from './engine';
import { UserError } from './engine';
import { searchMarket } from './market';
import { createDeal, store, snapshot, subscribe, commit, resetStore, getDeal, getBuyer, DEAL_ID } from './store';
import { postMessage, translateStrings, isLang } from './chat';
import { ask } from './assistant';
import { storyStep, storyRun, storyBusy } from './story';
import { verifyWebhook } from './paypal';
import { speechToText, textToSpeech } from './sarvam';
import { runPause, pressureSpans, checkText, messageVerdict } from './pause';
import { mountMcp } from './mcp';

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '200kb' }));

/** Small per-address limiter so the paid language and voice calls cannot be run up by anyone. */
function limit(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const now = Date.now(), k = req.ip ?? 'x';
    const recent = (hits.get(k) ?? []).filter(t => now - t < windowMs);
    if (recent.length >= max) return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
    recent.push(now); hits.set(k, recent);
    if (hits.size > 5000) for (const [key, v] of hits) if (!v.some(t => now - t < windowMs)) hits.delete(key);
    next();
  };
}
app.use('/api', limit(240, 60_000));
app.use(['/api/stt', '/api/tts', '/api/i18n', '/api/assistant', '/api/chat', '/api/pause/check-message', '/mcp'], limit(60, 60_000));
app.use('/api/pause/eval', limit(6, 60_000));

const wrap = (fn: (req: express.Request, res: express.Response) => Promise<unknown>) =>
  (req: express.Request, res: express.Response) => {
    fn(req, res).catch(e => {
      const status = e instanceof UserError ? e.status : 500;
      if (status === 500) console.error(e);
      res.status(status).json({ error: e instanceof Error ? e.message : 'Something went wrong' });
    });
  };

app.post('/api/join-requests/:id/:decision', wrap(async (req, res) => {
  const d = req.params.decision;
  if (d !== 'approve' && d !== 'decline') throw new UserError('Unknown answer', 404);
  res.json(await engine.answerJoinRequest(req.params.id, d === 'approve' ? 'yes' : 'no', Boolean(req.body?.interactive)));
}));
mountMcp(app);

app.get('/api/health', (_req, res) => res.json({ ok: true, languageService: sarvamLast.at ? { ...sarvamLast, agoSec: Math.round((Date.now() - sarvamLast.at) / 1000) } : 'ok' }));
app.get('/api/state', (_req, res) => res.json(snapshot()));
app.get('/api/config', (_req, res) => res.json(snapshot().config));
app.get('/api/scam-list', (_req, res) => res.json(store.scamList));

app.get('/api/events', (req, res) => {
  res.set({ 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  res.flushHeaders();
  const send = (s: unknown) => res.write(`data: ${JSON.stringify(s)}\n\n`);
  send(snapshot());
  const off = subscribe(send);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => { off(); clearInterval(ping); });
});

app.post('/api/reset', wrap(async (_req, res) => { resetStore(); res.json({ ok: true }); }));

app.get('/api/market/search', wrap(async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) throw new UserError('Type a product name');
  try { res.json({ items: await searchMarket(q) }); }
  catch (e) { throw new UserError('Price lookup is not available right now', 502); }
}));

app.post('/api/deals', wrap(async (req, res) => {
  const b = req.body ?? {};
  const name = String(b.productName ?? '').trim().slice(0, 60);
  const pack = String(b.pack ?? '').trim().slice(0, 40) || 'each';
  const unit = String(b.unit ?? '').trim().slice(0, 16).replace(/s$/i, '') || 'unit';
  const market = Number(b.marketPrice);
  const target = Math.round(Number(b.targetQty));
  if (name.length < 2) throw new UserError('Name the product');
  if (!(market >= 0.2 && market <= 100000)) throw new UserError('Enter the usual shop price (at least 0.20)');
  if (!(target >= 10 && target <= 1_000_000)) throw new UserError('Target quantity must be between 10 and 1,000,000');
  const deal = createDeal({ productName: name, pack, unit, marketPrice: market, targetQty: target, createdBy: b.buyerId, marketSource: b.marketSource });
  commit();
  res.json(deal);
}));

app.post('/api/deals/:id/join', wrap(async (req, res) => {
  const { buyerId, qty, maxUnitPrice, interactive } = req.body ?? {};
  const c = await engine.join(req.params.id, String(buyerId), Number(qty), Number(maxUnitPrice), Boolean(interactive));
  res.json(c);
}));
app.post('/api/deals/:id/negotiate', wrap(async (req, res) => {
  res.json({ started: true });
  engine.negotiateDeal(req.params.id).catch(e => { console.error('[negotiate]', e); });
}));
app.post('/api/deals/:id/settle', wrap(async (req, res) => { res.json(await engine.settle(req.params.id)); }));
app.post('/api/deals/:id/cancel', wrap(async (req, res) => { await engine.cancel(req.params.id); res.json({ ok: true }); }));

app.post('/api/deals/:id/schedule', wrap(async (req, res) => {
  const slots = req.body?.slots;
  if (!Array.isArray(slots)) throw new UserError('Send the list of stops');
  engine.setDelivery(req.params.id, slots);
  res.json({ ok: true });
}));
app.post('/api/commitments/:id/helper', wrap(async (req, res) => { engine.setHelper(req.params.id, String(req.body?.name ?? '')); res.json({ ok: true }); }));
app.post('/api/commitments/:id/helper/answer', wrap(async (req, res) => {
  const d = req.body?.decision;
  if (d !== 'yes' && d !== 'no') throw new UserError('Say yes or no');
  await engine.answerHelper(req.params.id, d);
  res.json({ ok: true });
}));
app.post('/api/commitments/:id/approve', wrap(async (req, res) => { await engine.approve(req.params.id, req.body?.decision === 'no' ? 'no' : 'yes'); res.json({ ok: true }); }));
app.post('/api/commitments/:id/withdraw', wrap(async (req, res) => { await engine.withdraw(req.params.id); res.json({ ok: true }); }));
app.post('/api/commitments/:id/paypal/order', wrap(async (req, res) => { res.json(await engine.paypalOrder(req.params.id)); }));
app.post('/api/commitments/:id/paypal/authorize', wrap(async (req, res) => { res.json(await engine.paypalAuthorize(req.params.id, String(req.body?.orderId))); }));

app.post('/api/buyers/:id/autonomy', wrap(async (req, res) => {
  const b = getBuyer(req.params.id);
  if (!b) throw new UserError('Buyer not found', 404);
  b.autonomy = req.body?.autonomy === 'auto' ? 'auto' : 'ask';
  commit();
  res.json(b);
}));

app.post('/api/chat', wrap(async (req, res) => {
  const { dealId = DEAL_ID, buyerId, text, lang } = req.body ?? {};
  const b = getBuyer(String(buyerId));
  if (!b || typeof text !== 'string' || !text.trim()) throw new UserError('Message needs a buyer and some text');
  const m = await postMessage({ dealId, from: 'buyer', buyerId: b.id, text: text.trim().slice(0, 600), lang: isLang(lang) ? lang : b.lang }, commit);
  res.json(m);
}));

app.post('/api/assistant', wrap(async (req, res) => {
  const { dealId = DEAL_ID, buyerId, text, lang } = req.body ?? {};
  if (!getDeal(dealId) || typeof text !== 'string') throw new UserError('Bad request');
  res.json(await ask({ dealId, buyerId: String(buyerId), text: text.slice(0, 500), lang: isLang(lang) ? lang : 'en' }));
}));

app.post('/api/i18n', wrap(async (req, res) => {
  const { lang, strings } = req.body ?? {};
  if (!isLang(lang) || typeof strings !== 'object' || !strings) throw new UserError('Bad request');
  res.json(await translateStrings(lang, strings));
}));

// Try Pause on any pasted seller message (used by the "Check a message" box).
app.post('/api/pause/check-message', wrap(async (req, res) => {
  const text = String(req.body?.text ?? '').slice(0, 1000);
  const highlights = await checkText(text);
  res.json({ highlights, verdict: messageVerdict(highlights).status });
}));

/** Scores Pause's message check on the labelled sets in server/eval. `model=1` adds the model's pointers. */
app.get('/api/pause/eval', wrap(async (req, res) => {
  const set = String(req.query.set ?? 'holdout').replace(/[^a-z0-9]/g, '');
  const useModel = req.query.model === '1';
  const rows: { text: string; risky: boolean }[] = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'eval', `${set}.json`), 'utf8'));
  const verdicts: ('pass' | 'warn' | 'fail')[] = new Array(rows.length);
  let next = 0;
  await Promise.all(Array.from({ length: 12 }, async () => {
    while (next < rows.length) { const i = next++; verdicts[i] = messageVerdict(await checkText(rows[i].text, useModel)).status; }
  }));
  const m = (pred: (v: string) => boolean) => {
    let tp = 0, fp = 0, fn = 0, tn = 0; const missed: string[] = [], alarms: string[] = [];
    rows.forEach((r, i) => { const p = pred(verdicts[i]); if (r.risky && p) tp++; else if (r.risky) { fn++; missed.push(r.text); } else if (p) { fp++; alarms.push(r.text); } else tn++; });
    return { precision: +(tp / Math.max(1, tp + fp)).toFixed(3), recall: +(tp / Math.max(1, tp + fn)).toFixed(3), falseAlarms: fp, missed: fn, missedText: missed, alarmText: alarms };
  };
  res.json({ set, model: useModel, messages: rows.length, flagged: m(v => v !== 'pass'), blocked: m(v => v === 'fail') });
}));

app.post('/api/stt', express.raw({ type: () => true, limit: '8mb' }), wrap(async (req, res) => {
  const buf = req.body as Buffer;
  if (!Buffer.isBuffer(buf) || buf.length < 500) throw new UserError('No audio received');
  const r = await speechToText(buf, String(req.headers['content-type'] ?? 'audio/webm'), String(req.query.lang ?? 'auto'));
  if (!r) throw new UserError('Could not hear that. Please try again.', 502);
  res.json(r);
}));
app.post('/api/tts', wrap(async (req, res) => {
  const text = String(req.body?.text ?? '').trim();
  if (!text) throw new UserError('Nothing to read');
  const audio = await textToSpeech(text, String(req.body?.lang ?? 'en'));
  if (!audio) throw new UserError('Voice is not available right now', 502);
  res.json({ audio });
}));

app.post('/api/demo/step', wrap(async (_req, res) => {
  if (storyBusy()) throw new UserError('Demo step is still running', 409);
  const step = await storyStep();
  res.json({ step });
}));
app.post('/api/demo/run', wrap(async (_req, res) => {
  if (storyBusy()) throw new UserError('Demo step is still running', 409);
  res.json({ started: true });
  storyRun().catch(e => console.error('[story]', e));
}));

app.post('/api/paypal/webhook', express.json({ limit: '1mb' }), wrap(async (req, res) => {
  const ok = await verifyWebhook(req.headers as any, req.body);
  if (!ok) { res.status(400).json({ error: 'bad signature' }); return; }
  engine.onWebhook(req.body);
  res.json({ ok: true });
}));

// Serve the built web app when present.
if (fs.existsSync(config.webDist)) {
  app.use(express.static(config.webDist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(config.webDist, 'index.html')));
}

app.listen(config.port, () => {
  console.log(`Buy Together API on http://localhost:${config.port}  paypal=${config.paypal.enabled ? 'sandbox' : 'simulated'}  languages=${LANGUAGES.length}`);
});
