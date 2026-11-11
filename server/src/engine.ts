import crypto from 'node:crypto';
import { config } from './config';
import * as pp from './paypal';
import { runPause, reportSeller } from './pause';
import { negotiate, openingQuote } from './negotiation';
import { marketMedian } from './market';
import {
  store, commit, addEvent, getDeal, getBuyer, getSeller, heldCommitments, heldQty, tierFor, uid, r2, sleep,
} from './store';
import type { Commitment, Deal, DeliverySlot, JoinRequest } from '../../shared/types';

export class UserError extends Error {
  constructor(msg: string, public status = 400) { super(msg); }
}

export const UNDO_MS = Number(process.env.UNDO_SECONDS ?? 8) * 1000;
let paced = true;
export const setPaced = (v: boolean) => { paced = v; };
const pause = (ms: number) => (paced ? sleep(ms) : Promise.resolve());

const usd = (n: number) => `$${r2(n).toFixed(2)}`;

function needDeal(id: string): Deal {
  const d = getDeal(id);
  if (!d) throw new UserError('Deal not found', 404);
  return d;
}
function needCommitment(id: string): Commitment {
  const c = store.commitments.find(x => x.id === id);
  if (!c) throw new UserError('Commitment not found', 404);
  return c;
}

/** Optional server-side test card so simulated buyers can hold real sandbox money. */
function testCard() {
  const number = process.env.PAYPAL_TEST_CARD_NUMBER;
  if (!number) return undefined;
  return { number, expiry: process.env.PAYPAL_TEST_CARD_EXPIRY ?? '2030-12', cvv: process.env.PAYPAL_TEST_CARD_CVV ?? '123', name: 'Demo Buyer' };
}

export async function join(dealId: string, buyerId: string, qty: number, maxUnitPrice: number, interactive = false): Promise<Commitment> {
  const deal = needDeal(dealId);
  const buyer = getBuyer(buyerId);
  if (!buyer) throw new UserError('Buyer not found', 404);
  if (deal.status !== 'open') throw new UserError('This deal is no longer taking new buyers');
  if (!Number.isFinite(qty) || qty < 1 || qty > 100_000) throw new UserError('Quantity must be between 1 and 100000');
  if (!Number.isFinite(maxUnitPrice) || maxUnitPrice <= 0) throw new UserError('Walk-away price must be above zero');
  if (store.commitments.some(c => c.dealId === dealId && c.buyerId === buyerId && (c.status === 'held' || c.status === 'awaiting_paypal'))) {
    throw new UserError(`${buyer.name} is already in this deal`);
  }
  const c: Commitment = {
    id: uid('c'), dealId, buyerId, qty, maxUnitPrice: r2(maxUnitPrice), status: 'held', approval: 'pending', createdAt: Date.now(),
  };
  const authorized = r2(qty * c.maxUnitPrice);

  if (interactive && config.paypal.enabled) {
    c.status = 'awaiting_paypal';
    c.hold = { mode: 'paypal', authorized, currency: config.currency, note: 'Waiting for the buyer to approve in PayPal' };
  } else if (config.paypal.enabled && testCard()) {
    try {
      const r = await pp.createAuthorizeOrder({
        amount: authorized, currency: config.currency, customId: c.id, requestId: `auth-${c.id}`,
        description: `${buyer.name}: ${qty} x ${deal.product.name}`, card: testCard(),
      });
      if (!r.authorizationId) throw new Error(`Order ${r.orderId} is ${r.status}, not authorized`);
      c.hold = { mode: 'paypal', orderId: r.orderId, authorizationId: r.authorizationId, authorized, currency: config.currency };
    } catch (e) {
      console.warn('[join] card auth failed, using simulated hold:', (e as Error).message);
      c.hold = { mode: 'simulated', authorized, currency: config.currency, note: 'Simulated hold (card authorization unavailable)' };
    }
  } else {
    c.hold = { mode: 'simulated', authorized, currency: config.currency, note: 'Simulated hold' };
  }
  store.commitments.push(c);
  if (c.status === 'held') {
    addEvent(dealId, 'join', `${buyer.name} joined with ${qty} ${deal.product.unit}s. ${usd(authorized)} is held, nothing is spent.`, 'good');
  } else {
    addEvent(dealId, 'join', `${buyer.name} is joining with ${qty} ${deal.product.unit}s and approving the hold in PayPal.`);
  }
  commit();
  return c;
}

export async function paypalOrder(commitmentId: string) {
  const c = needCommitment(commitmentId);
  if (!config.paypal.enabled) throw new UserError('PayPal is not configured on this server');
  if (c.status !== 'awaiting_paypal' || !c.hold) throw new UserError('This share is not waiting for PayPal');
  const buyer = getBuyer(c.buyerId)!;
  const deal = needDeal(c.dealId);
  const r = await pp.createAuthorizeOrder({
    amount: c.hold.authorized, currency: c.hold.currency, customId: c.id, requestId: `order-${c.id}`,
    description: `${buyer.name}: ${c.qty} x ${deal.product.name}`,
  });
  c.hold.orderId = r.orderId;
  commit();
  return { orderId: r.orderId };
}

export async function paypalAuthorize(commitmentId: string, orderId: string) {
  const c = needCommitment(commitmentId);
  if (!c.hold || c.hold.orderId !== orderId) throw new UserError('Order does not match this share');
  const r = await pp.authorizeOrder(orderId, `authorize-${c.id}`);
  if (!r.authorizationId) throw new UserError(`PayPal did not authorize the order (status ${r.status})`);
  c.hold.authorizationId = r.authorizationId;
  c.hold.note = undefined;
  c.status = 'held';
  const buyer = getBuyer(c.buyerId)!;
  addEvent(c.dealId, 'hold', `PayPal is holding ${usd(c.hold.authorized)} for ${buyer.name}. Nothing is spent yet.`, 'good');
  commit();
  return c;
}

async function voidHold(c: Commitment) {
  if (c.hold?.mode === 'paypal' && c.hold.authorizationId) {
    try { await pp.voidAuthorization(c.hold.authorizationId, `void-${c.id}`); }
    catch (e) { console.warn('[void] failed', (e as Error).message); }
  }
  c.status = 'voided';
}

export async function withdraw(commitmentId: string) {
  const c = needCommitment(commitmentId);
  const deal = needDeal(c.dealId);
  if (deal.status !== 'open' && deal.status !== 'review') throw new UserError('Too late to leave this deal');
  if (c.status !== 'held' && c.status !== 'awaiting_paypal') throw new UserError('Nothing to withdraw');
  await voidHold(c);
  const buyer = getBuyer(c.buyerId)!;
  addEvent(c.dealId, 'withdraw', `${buyer.name} left the deal. ${usd(c.hold?.authorized ?? 0)} was released.`, 'warn');
  if (deal.status === 'review') resetToOpen(deal, 'A buyer left, so the agent will check the price again.');
  commit();
}

function resetToOpen(deal: Deal, why: string) {
  deal.status = 'open';
  deal.quotes = [];
  deal.rounds = [];
  deal.pause = {};
  deal.chosenSellerId = undefined;
  deal.finalUnitPrice = undefined;
  deal.undoUntil = undefined;
  for (const c of heldCommitments(deal.id)) c.approval = 'pending';
  addEvent(deal.id, 'reopen', why, 'warn');
}

export async function negotiateDeal(dealId: string) {
  const deal = needDeal(dealId);
  if (deal.status !== 'open') throw new UserError('The agent already started on this deal');
  const held = heldCommitments(dealId);
  const total = heldQty(dealId);
  if (total < deal.targetQty) throw new UserError(`The group has ${total} of ${deal.targetQty} ${deal.product.unit}s. The agent starts at ${deal.targetQty}.`);

  const mk = await marketMedian(`${deal.product.name} ${deal.product.pack}`, deal.marketPrice);
  if (mk) {
    deal.marketCheck = { source: 'channel3', median: mk.median, count: mk.count };
    addEvent(dealId, 'market', `Channel3 cross-check: ${mk.count} shop listings, middle price ${usd(mk.median)}. Pause compares offers with ${usd(deal.marketPrice)}.`);
  }

  const ceiling = Math.min(...held.map(c => c.maxUnitPrice));
  deal.status = 'negotiating';
  deal.quotes = []; deal.rounds = []; deal.pause = {};
  addEvent(dealId, 'rfq', `${config.agentName} asked ${deal.sellerIds.length} sellers to quote ${total} ${deal.product.unit}s. Group limit: ${usd(ceiling)} each.`);
  commit();

  // 1. Collect quotes and run Pause on each opening offer.
  for (const sid of deal.sellerIds) {
    const seller = getSeller(sid)!;
    const q = openingQuote(deal, seller, total);
    deal.quotes.push(q);
    addEvent(dealId, 'quote', `${seller.name} quoted ${usd(q.unitPrice)} per ${deal.product.unit}.`);
    commit();
    await pause(700);
    const report = runPause(deal, seller, q);
    deal.pause[sid] = report;
    if (report.decision === 'block') {
      q.status = 'rejected';
      const e = reportSeller(seller.name, 'Price far below market', true);
      addEvent(dealId, 'pause', `Pause blocked ${seller.name}: ${report.checks.filter(c => c.status === 'fail').map(c => c.title.toLowerCase()).join(', ')}. Added to the shared warning list (${e.families} groups).`, 'bad');
    } else {
      addEvent(dealId, 'pause', `Pause checked ${seller.name}: ${report.decision === 'clear' ? 'clear' : 'proceed with care'}.`, report.decision === 'clear' ? 'good' : 'warn');
    }
    commit();
    await pause(500);
  }

  // 2. Negotiate with every seller that passed.
  for (const q of deal.quotes) {
    if (q.status === 'rejected') continue;
    const seller = getSeller(q.sellerId)!;
    q.status = 'countering';
    commit();
    const res = await negotiate(deal, seller, total, ceiling, async r => {
      deal.rounds.push(r);
      commit();
      await pause(900);
    });
    if (res.agreed === null) {
      q.status = 'rejected';
      addEvent(dealId, 'nego', `${seller.name} would not go under the group limit.`, 'warn');
    } else {
      q.unitPrice = res.agreed;
      q.status = 'agreed';
      deal.pause[q.sellerId] = runPause(deal, seller, q);
      addEvent(dealId, 'nego', `${config.agentName} agreed ${usd(res.agreed)} per ${deal.product.unit} with ${seller.name}.`, 'good');
    }
    commit();
  }

  // 3. Pick the cheapest safe offer; clear beats warn.
  const rank = (sid: string) => (deal.pause[sid]?.decision === 'clear' ? 0 : 1);
  const options = deal.quotes
    .filter(q => q.status === 'agreed' && deal.pause[q.sellerId]?.decision !== 'block')
    .sort((a, b) => rank(a.sellerId) - rank(b.sellerId) || a.unitPrice - b.unitPrice);
  if (!options.length) {
    resetToOpen(deal, 'No offer passed the safety checks, so nothing was bought. All money is still only held.');
    commit();
    return deal;
  }
  const best = options[0];
  deal.chosenSellerId = best.sellerId;
  deal.finalUnitPrice = best.unitPrice;
  deal.status = 'review';
  for (const c of held) c.approval = getBuyer(c.buyerId)?.autonomy === 'auto' && best.unitPrice <= c.maxUnitPrice ? 'yes' : 'pending';
  const seller = getSeller(best.sellerId)!;
  addEvent(dealId, 'review', `${seller.name} at ${usd(best.unitPrice)} per ${deal.product.unit}. Each buyer must say yes before any money moves.`, 'good');
  deal.delivery = planDelivery(deal);
  maybeOpenUndo(deal);
  commit();
  return deal;
}

function maybeOpenUndo(deal: Deal) {
  const held = heldCommitments(deal.id);
  if (deal.status === 'review' && held.length && held.every(c => c.approval === 'yes') && !deal.undoUntil) {
    deal.undoUntil = Date.now() + UNDO_MS;
    addEvent(deal.id, 'undo', `Everyone said yes. Undo window is open for ${Math.round(UNDO_MS / 1000)} seconds.`, 'info');
  }
}

export async function approve(commitmentId: string, decision: 'yes' | 'no') {
  const c = needCommitment(commitmentId);
  const deal = needDeal(c.dealId);
  if (deal.status !== 'review') throw new UserError('There is nothing to approve right now');
  if (c.status !== 'held') throw new UserError('This share is not held');
  const buyer = getBuyer(c.buyerId)!;
  if (decision === 'no') {
    c.approval = 'no';
    await voidHold(c);
    addEvent(deal.id, 'approve', `${buyer.name} said no. ${usd(c.hold?.authorized ?? 0)} was released.`, 'warn');
    resetToOpen(deal, 'A buyer said no, so the agent will check the price again with the rest.');
  } else {
    if (deal.finalUnitPrice! > c.maxUnitPrice + 1e-9) throw new UserError('The price is above this buyer\'s walk-away limit');
    if (c.helperName && !c.helperOk) throw new UserError(`${c.helperName} has to confirm first`);
    c.approval = 'yes';
    addEvent(deal.id, 'approve', `${buyer.name} said yes to ${usd(deal.finalUnitPrice!)} per ${deal.product.unit}.`, 'good');
    maybeOpenUndo(deal);
  }
  commit();
}

export async function settle(dealId: string) {
  const deal = needDeal(dealId);
  if (deal.status !== 'review' || !deal.chosenSellerId || deal.finalUnitPrice == null) throw new UserError('Deal is not ready to pay');
  const held = heldCommitments(dealId);
  if (!held.every(c => c.approval === 'yes')) throw new UserError('Not every buyer has said yes');
  if (!deal.undoUntil || Date.now() < deal.undoUntil) throw new UserError('Undo window is still open', 409);
  const seller = getSeller(deal.chosenSellerId)!;
  const q = deal.quotes.find(x => x.sellerId === seller.id)!;
  const report = runPause(deal, seller, q);
  deal.pause[seller.id] = report;
  if (report.decision === 'block') throw new UserError('Pause blocked the payment at the last check');

  // Pre-flight: every PayPal authorization must still be usable before we capture any of them.
  for (const c of held) {
    if (c.hold?.mode === 'paypal' && c.hold.authorizationId) {
      const a = await pp.getAuthorization(c.hold.authorizationId);
      if (a.status !== 'CREATED' && a.status !== 'PENDING') throw new UserError(`A hold is no longer usable (${a.status}). Nothing was charged.`, 409);
    }
  }
  const price = deal.finalUnitPrice;
  let paid = 0;
  for (const c of held) {
    const amount = r2(c.qty * price);
    if (c.hold?.mode === 'paypal' && c.hold.authorizationId) {
      const r = await pp.capture(c.hold.authorizationId, amount, c.hold.currency, `capture-${c.id}`, `${deal.id}-${c.id}`);
      c.captureId = r.captureId;
    } else {
      c.captureId = `SIM-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    }
    c.captured = amount;
    c.status = 'captured';
    paid += amount;
    const b = getBuyer(c.buyerId)!;
    addEvent(dealId, 'capture', `${b.name} paid ${usd(amount)}. ${usd(r2((c.hold?.authorized ?? 0) - amount))} of the hold went back.`, 'good');
    commit();
    await pause(350);
  }
  const totalQty = held.reduce((a, c) => a + c.qty, 0);
  const savedPerUnit = r2(deal.marketPrice - price);
  deal.status = 'paid';
  deal.undoUntil = undefined;
  deal.summary = {
    totalQty, listPrice: tierFor(deal, totalQty).unitPrice, finalPrice: price, savedPerUnit,
    savedTotal: r2(savedPerUnit * totalQty), paidTotal: r2(paid),
  };
  addEvent(dealId, 'paid', `Paid ${usd(paid)} to ${seller.name} for ${totalQty} ${deal.product.unit}s. Together you saved ${usd(deal.summary.savedTotal)} against the market price.`, 'good');
  commit();
  return deal;
}

export async function cancel(dealId: string) {
  const deal = needDeal(dealId);
  if (deal.status === 'paid') throw new UserError('Already paid');
  for (const c of store.commitments.filter(x => x.dealId === dealId && (x.status === 'held' || x.status === 'awaiting_paypal'))) await voidHold(c);
  deal.status = 'cancelled';
  deal.undoUntil = undefined;
  addEvent(dealId, 'cancel', 'Deal cancelled. Every hold was returned to its buyer. No money was spent.', 'warn');
  commit();
}

/** Webhook events from PayPal become timeline lines. State is already updated by our own calls. */
export function onWebhook(event: any) {
  const type = String(event?.event_type ?? '');
  const customId = event?.resource?.custom_id ?? event?.resource?.supplementary_data?.related_ids?.order_id;
  const c = store.commitments.find(x => x.id === customId || x.hold?.authorizationId === event?.resource?.id);
  const deal = c ? c.dealId : store.deals[0].id;
  const label: Record<string, string> = {
    'PAYMENT.AUTHORIZATION.CREATED': 'PayPal confirmed a hold.',
    'PAYMENT.AUTHORIZATION.VOIDED': 'PayPal confirmed a hold was released.',
    'PAYMENT.CAPTURE.COMPLETED': 'PayPal confirmed a payment.',
  };
  if (label[type]) { addEvent(deal, 'webhook', label[type], 'info'); commit(); }
}

/** An outside agent (through MCP) can ask to join for a buyer. Nothing is held until the buyer says yes. */
export function requestJoin(agent: string, dealId: string, buyerId: string, qty: number, maxUnitPrice: number): JoinRequest {
  const deal = getDeal(dealId);
  const buyer = getBuyer(buyerId);
  if (!deal) throw new UserError('No such deal', 404);
  if (!buyer) throw new UserError('No such buyer', 404);
  if (deal.status !== 'open') throw new UserError('This deal is not open');
  if (!(qty >= 1 && qty <= 1_000_000)) throw new UserError('Quantity must be at least 1');
  if (!(maxUnitPrice > 0)) throw new UserError('Walk-away price must be above zero');
  const r: JoinRequest = { id: uid('jr'), dealId, buyerId, agent: agent.slice(0, 40) || 'An agent', qty: Math.round(qty), maxUnitPrice, ts: Date.now(), status: 'pending' };
  store.joinRequests.push(r);
  addEvent(dealId, 'agent-request', `${r.agent} asked to join for ${buyer.name}: ${r.qty} ${deal.product.unit}s, up to ${usd(maxUnitPrice)} each. Waiting for ${buyer.name} to say yes.`, 'info');
  commit();
  return r;
}

export async function answerJoinRequest(id: string, decision: 'yes' | 'no', interactive = false) {
  const r = store.joinRequests.find(x => x.id === id);
  if (!r) throw new UserError('No such request', 404);
  if (r.status !== 'pending') throw new UserError('Already answered');
  if (decision === 'no') { r.status = 'declined'; commit(); return r; }
  await join(r.dealId, r.buyerId, r.qty, r.maxUnitPrice, interactive);
  r.status = 'approved';
  commit();
  return r;
}

/** A family helper has to confirm a buyer's yes. The helper gets a link and answers in their own language. */
export function setHelper(commitmentId: string, name: string) {
  const c = needCommitment(commitmentId);
  const clean = name.trim().slice(0, 30);
  if (c.status !== 'held') throw new UserError('This share is not held');
  if (c.approval === 'yes') throw new UserError('Already approved');
  if (clean) { c.helperName = clean; c.helperOk = false; } else { c.helperName = undefined; c.helperOk = undefined; }
  commit();
}

export async function answerHelper(commitmentId: string, decision: 'yes' | 'no') {
  const c = needCommitment(commitmentId);
  const deal = needDeal(c.dealId);
  const buyer = getBuyer(c.buyerId)!;
  if (!c.helperName) throw new UserError('No helper is set for this share');
  if (deal.status !== 'review') throw new UserError('There is nothing to confirm right now');
  if (decision === 'yes') {
    c.helperOk = true;
    addEvent(deal.id, 'helper', `${c.helperName} checked the deal for ${buyer.name} and said it looks right.`, 'good');
    commit();
  } else {
    addEvent(deal.id, 'helper', `${c.helperName} advised ${buyer.name} not to go ahead.`, 'warn');
    await approve(commitmentId, 'no');
  }
}

/** Munim's first plan for the delivery truck: shops in city order, stop length grows with quantity, 15 minutes between stops. */
export function planDelivery(deal: Deal): DeliverySlot[] {
  const held = heldCommitments(deal.id)
    .map(c => ({ c, b: getBuyer(c.buyerId)! }))
    .sort((x, y) => x.b.city.localeCompare(y.b.city) || x.b.name.localeCompare(y.b.name));
  let t = 0;
  return held.map(({ c }) => {
    const len = Math.min(120, Math.max(30, Math.round((20 + c.qty / 12) / 5) * 5));
    const slot = { buyerId: c.buyerId, startMin: t, endMin: t + len };
    t += len + 15;
    return slot;
  });
}

export function setDelivery(dealId: string, slots: DeliverySlot[]) {
  const deal = needDeal(dealId);
  if (deal.status !== 'review') throw new UserError('The delivery plan can be changed while the deal is being approved');
  const ids = new Set(heldCommitments(dealId).map(c => c.buyerId));
  const clean = slots.map(s => ({ buyerId: String(s.buyerId), startMin: Math.round(Number(s.startMin)), endMin: Math.round(Number(s.endMin)) }));
  if (clean.length !== ids.size || !clean.every(s => ids.has(s.buyerId))) throw new UserError('Every paying shop needs exactly one stop');
  if (clean.some(s => !(s.startMin >= 0 && s.endMin > s.startMin && s.endMin <= 720))) throw new UserError('Stops must fit inside the 12 hour delivery day');
  const sorted = [...clean].sort((a, b) => a.startMin - b.startMin);
  for (let i = 1; i < sorted.length; i++) if (sorted[i].startMin < sorted[i - 1].endMin) throw new UserError('One truck cannot be at two shops at once');
  deal.delivery = clean;
  addEvent(dealId, 'delivery', 'The delivery plan was changed.', 'info');
  commit();
}
