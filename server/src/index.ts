import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { config, LANGUAGES } from './config';
import * as engine from './engine';
import { UserError } from './engine';
import { store, snapshot, subscribe, commit, resetStore, getDeal, getBuyer, DEAL_ID } from './store';
import { postMessage, translateStrings, isLang } from './chat';
import { ask } from './assistant';
import { storyStep, storyRun, storyBusy } from './story';
import { verifyWebhook } from './paypal';
import { runPause, pressureSpans } from './pause';

const app = express();
app.use(express.json({ limit: '200kb' }));

const wrap = (fn: (req: express.Request, res: express.Response) => Promise<unknown>) =>
  (req: express.Request, res: express.Response) => {
    fn(req, res).catch(e => {
      const status = e instanceof UserError ? e.status : 500;
      if (status === 500) console.error(e);
      res.status(status).json({ error: e instanceof Error ? e.message : 'Something went wrong' });
    });
  };

app.get('/api/health', (_req, res) => res.json({ ok: true }));
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
  res.json({ highlights: pressureSpans(text) });
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
