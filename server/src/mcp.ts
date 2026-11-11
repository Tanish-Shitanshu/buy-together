import type express from 'express';
import { store, getDeal, tierFor, heldQty } from './store';
import { pressureSpans, runPause } from './pause';
import * as engine from './engine';

/** A small MCP server (JSON-RPC over HTTP) so any agent can read deals, test a seller's message with
 *  Pause, and ask to join. Joining never moves money: the buyer has to say yes in the app first. */

const dealView = (id: string) => {
  const d = getDeal(id);
  if (!d) return null;
  const qty = heldQty(id);
  const tier = tierFor(d, qty);
  const next = d.tiers.find(t => t.minQty > qty);
  return {
    id: d.id, title: d.title, status: d.status, unit: d.product.unit, pack: d.product.pack,
    shopPrice: d.marketPrice, rateCard: d.tiers, joinedQty: qty, targetQty: d.targetQty,
    priceNow: tier.unitPrice, nextTier: next ? { qty: next.minQty, price: next.unitPrice, moreNeeded: next.minQty - qty } : null,
    finalPrice: d.finalUnitPrice ?? null,
  };
};

const TOOLS = [
  { name: 'list_deals', description: 'List group-buying deals with price now, rate card and how many units are joined.', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_deal', description: 'Full detail of one deal, including Pause results for each seller quote.', inputSchema: { type: 'object', properties: { dealId: { type: 'string' } }, required: ['dealId'] } },
  { name: 'check_message', description: 'Run Pause on a seller message. Returns the pressure and off-platform payment wording found.', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
  { name: 'check_seller', description: 'Check a seller name against the shared warning list.', inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] } },
  { name: 'request_join', description: 'Ask to join a deal for a buyer. The buyer must approve in the app before any money is held.', inputSchema: { type: 'object', properties: { dealId: { type: 'string' }, buyerId: { type: 'string' }, qty: { type: 'number' }, maxUnitPrice: { type: 'number', description: 'Highest price per unit the buyer accepts' }, agentName: { type: 'string' } }, required: ['dealId', 'buyerId', 'qty', 'maxUnitPrice'] } },
];

async function call(name: string, a: any): Promise<unknown> {
  switch (name) {
    case 'list_deals': return store.deals.map(d => dealView(d.id));
    case 'get_deal': {
      const v = dealView(String(a.dealId));
      if (!v) throw new Error('No such deal');
      const d = getDeal(String(a.dealId))!;
      return { ...v, quotes: d.quotes.map(q => ({ seller: q.sellerId, unitPrice: q.unitPrice, status: q.status, pause: d.pause[q.sellerId]?.decision ?? null })) };
    }
    case 'check_message': {
      const text = String(a.text ?? '');
      const spans = pressureSpans(text);
      const kinds = [...new Set(spans.map(s => s.label))];
      return { safe: kinds.length < 2, found: spans.map(s => ({ text: text.slice(s.start, s.end), kind: s.label })), advice: kinds.length >= 2 ? 'Do not pay. This looks like pressure plus payment outside the held deal.' : kinds.length ? 'Some pressure wording. Ask for proof before paying.' : 'No pressure wording found.' };
    }
    case 'check_seller': {
      const k = String(a.name ?? '').trim().toLowerCase();
      const e = store.scamList.find(x => x.key === k && x.expiresAt > Date.now());
      return e ? { listed: true, reports: e.reports, families: e.families, reasons: e.reasons } : { listed: false };
    }
    case 'request_join': {
      const r = engine.requestJoin(String(a.agentName ?? 'An outside agent'), String(a.dealId), String(a.buyerId), Number(a.qty), Number(a.maxUnitPrice));
      return { requestId: r.id, status: r.status, note: 'Waiting for the buyer to approve in Buy Together. No money is held until then.' };
    }
    default: throw new Error(`Unknown tool ${name}`);
  }
}

export function mountMcp(app: express.Express) {
  app.get('/mcp', (_req, res) => res.json({ name: 'buy-together', transport: 'POST JSON-RPC to this URL', tools: TOOLS.map(t => t.name) }));
  app.post('/mcp', async (req, res) => {
    const { id, method, params } = req.body ?? {};
    const ok = (result: unknown) => res.json({ jsonrpc: '2.0', id, result });
    const fail = (code: number, message: string) => res.json({ jsonrpc: '2.0', id, error: { code, message } });
    try {
      if (method === 'initialize') return ok({ protocolVersion: params?.protocolVersion ?? '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'buy-together', version: '1.0.0' } });
      if (method?.startsWith('notifications/')) return res.status(202).end();
      if (method === 'ping') return ok({});
      if (method === 'tools/list') return ok({ tools: TOOLS });
      if (method === 'tools/call') {
        try {
          const out = await call(String(params?.name), params?.arguments ?? {});
          return ok({ content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] });
        } catch (e) {
          return ok({ isError: true, content: [{ type: 'text', text: (e as Error).message }] });
        }
      }
      return fail(-32601, `Method not found: ${method}`);
    } catch (e) { return fail(-32603, (e as Error).message); }
  });
}
