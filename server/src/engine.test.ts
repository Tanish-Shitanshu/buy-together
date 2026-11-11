import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resetStore, store, DEAL_ID } from './store';
import * as engine from './engine';
import { runPause, pressureSpans } from './pause';
import { negotiate, PROFILES } from './negotiation';
import { getDeal, getSeller } from './store';

engine.setPaced(false);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

test('full deal: join, agent, pause blocks the shady seller, all-or-nothing capture', async () => {
  resetStore();
  await engine.join(DEAL_ID, 'b_ravi', 400, 0.74);
  await engine.join(DEAL_ID, 'b_meena', 600, 0.72);
  const deal = getDeal(DEAL_ID)!;
  await engine.negotiateDeal(DEAL_ID);
  assert.equal(deal.status, 'review');
  assert.equal(deal.chosenSellerId, 'seller_metro');
  assert.equal(deal.finalUnitPrice, 0.64);
  assert.equal(deal.pause['seller_fast'].decision, 'block');
  assert.equal(deal.quotes.find(q => q.sellerId === 'seller_fast')!.status, 'rejected');
  // only the 'ask' buyer is pending
  const pending = store.commitments.filter(c => c.status === 'held' && c.approval === 'pending');
  assert.equal(pending.length, 1);
  await assert.rejects(() => engine.settle(DEAL_ID), /Not every buyer/);
  await engine.approve(pending[0].id, 'yes');
  await assert.rejects(() => engine.settle(DEAL_ID), /Undo window/);
  await sleep(engine.UNDO_MS + 100);
  await engine.settle(DEAL_ID);
  assert.equal(deal.status, 'paid');
  const paid = store.commitments.filter(c => c.status === 'captured');
  assert.equal(paid.length, 5);
  assert.equal(deal.summary!.totalQty, 1530);
  assert.equal(Math.round(deal.summary!.paidTotal * 100), Math.round(1530 * 0.64 * 100));
  for (const c of paid) assert.ok(c.captured! <= c.hold!.authorized);
});

test('a "no" releases that share and reopens the deal', async () => {
  resetStore();
  await engine.join(DEAL_ID, 'b_ravi', 400, 0.74);
  await engine.join(DEAL_ID, 'b_meena', 600, 0.72);
  await engine.negotiateDeal(DEAL_ID);
  const ravi = store.commitments.find(c => c.buyerId === 'b_ravi')!;
  await engine.approve(ravi.id, 'no');
  assert.equal(ravi.status, 'voided');
  assert.equal(getDeal(DEAL_ID)!.status, 'open');
});

test('agent will not start below the target and never exceeds the lowest limit', async () => {
  resetStore();
  await assert.rejects(() => engine.negotiateDeal(DEAL_ID), /starts at 1000/);
  const deal = getDeal(DEAL_ID)!;
  const r = await negotiate(deal, getSeller('seller_metro')!, 1530, 0.60, () => {});
  assert.equal(r.agreed, null); // floor 0.64 is above the group's limit
  for (const x of r.rounds.filter(x => x.by === 'agent')) assert.ok(x.unitPrice <= 0.60 + 1e-9);
  assert.equal(PROFILES.seller_metro.floorOfTop, 0.914);
});

test('pause: pressure wording is found', () => {
  const spans = pressureSpans('Only today! Pay 50% advance to our personal UPI id, no refunds, trust me');
  const labels = new Set(spans.map(s => s.label));
  assert.ok(labels.has('Time pressure') && labels.has('Pays outside the held deal') && labels.has('No way back') && labels.has('Empty assurance'));
});

test('joining twice and bad input are rejected', async () => {
  resetStore();
  await engine.join(DEAL_ID, 'b_ravi', 400, 0.74);
  await assert.rejects(() => engine.join(DEAL_ID, 'b_ravi', 10, 0.7), /already in/);
  await assert.rejects(() => engine.join(DEAL_ID, 'b_meena', 0, 0.7), /Quantity/);
  await assert.rejects(() => engine.join(DEAL_ID, 'b_meena', 10, -1), /price/);
});

test('cancel returns every hold', async () => {
  resetStore();
  await engine.cancel(DEAL_ID);
  assert.ok(store.commitments.every(c => c.status === 'voided'));
  assert.equal(getDeal(DEAL_ID)!.status, 'cancelled');
});
