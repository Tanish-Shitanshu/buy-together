import type { Deal, Highlight, PauseCheck, PauseReport, Quote, Seller } from '../../shared/types';
import { store, heldCommitments, r2 } from './store';

/** Pause: five plain-code checks that run before any money moves.
 *  No model decides anything here. A model may only help spot pressure wording (see pressureSpans). */

const PRESSURE: { re: RegExp; label: string }[] = [
  { re: /only (today|tonight|for \d+ (hours?|minutes?))|last chance|offer ends|ends in \d+ ?(hours?|minutes?|mins?)|within \d+ ?(hours?|minutes?|mins?)|hurry|act now|limited stock|right now/gi, label: 'Time pressure' },
  { re: /advance|upfront|pay (directly|first|before)|send (money|payment) to|personal (account|number|upi)|upi id|western union|gift ?card|crypto|outside (the )?(app|platform)|off[- ]platform|bank transfer to/gi, label: 'Pays outside the held deal' },
  { re: /no refunds?|non[- ]?refundable|final sale|cannot cancel/gi, label: 'No way back' },
  { re: /100% (safe|genuine|guaranteed)|trust me|risk[- ]?free|guaranteed|believe me/gi, label: 'Empty assurance' },
];

export function pressureSpans(text: string): Highlight[] {
  const out: Highlight[] = [];
  for (const { re, label } of PRESSURE) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) out.push({ start: m.index, end: m.index + m[0].length, label });
  }
  return out.sort((a, b) => a.start - b.start);
}

const key = (name: string) => name.trim().toLowerCase();

export function runPause(deal: Deal, seller: Seller, quote: Quote): PauseReport {
  const checks: PauseCheck[] = [];
  const ratio = quote.unitPrice / deal.marketPrice;

  // 1. Price against the market benchmark
  const pct = Math.round(ratio * 100);
  checks.push(
    ratio < 0.45
      ? { id: 'price', status: 'fail', title: 'Price is too good to be true', detail: `$${quote.unitPrice.toFixed(2)} is ${pct}% of the market price ($${deal.marketPrice.toFixed(2)}). Real distributors cannot sell this low.` }
      : ratio < 0.5
        ? { id: 'price', status: 'warn', title: 'Price is unusually low', detail: `$${quote.unitPrice.toFixed(2)} is ${pct}% of the market price ($${deal.marketPrice.toFixed(2)}).` }
        : { id: 'price', status: 'pass', title: 'Price is in a believable range', detail: `$${quote.unitPrice.toFixed(2)} is ${pct}% of the market price ($${deal.marketPrice.toFixed(2)}), under the public rate card.` },
  );

  // 2. Seller identity and the shared scam list
  const entry = store.scamList.find(e => e.key === key(seller.name) && e.expiresAt > Date.now());
  if (entry) {
    checks.push({
      id: 'seller',
      status: entry.families >= 3 ? 'fail' : 'warn',
      title: 'On the shared warning list',
      detail: `Reported ${entry.reports} times by ${entry.families} different buying groups: ${entry.reasons.join('; ')}.`,
    });
  } else if (!seller.verified) {
    checks.push({ id: 'seller', status: 'warn', title: 'Seller is not verified', detail: 'No trade licence on file. Ask for proof before paying.' });
  } else {
    checks.push({ id: 'seller', status: 'pass', title: 'Verified seller', detail: `${seller.name} has a trade licence on file and no reports.` });
  }

  // 3. Pressure words in the seller's own message
  const spans = quote.highlights.length ? quote.highlights : pressureSpans(quote.message);
  const kinds = [...new Set(spans.map(s => s.label))];
  checks.push(
    kinds.length >= 2
      ? { id: 'pressure', status: 'fail', title: 'Pressure and off-platform payment', detail: `The message uses: ${kinds.join(', ').toLowerCase()}.` }
      : kinds.length === 1
        ? { id: 'pressure', status: 'warn', title: 'Pressure wording', detail: `The message uses: ${kinds[0].toLowerCase()}.` }
        : { id: 'pressure', status: 'pass', title: 'No pressure wording', detail: 'The message is calm and asks for payment only through the held deal.' },
  );

  // 4. Money safety: every share is held and covers the final amount
  const held = heldCommitments(deal.id);
  const short = held.filter(c => !c.hold || c.qty * quote.unitPrice > c.hold.authorized + 0.005);
  checks.push(
    held.length === 0
      ? { id: 'money', status: 'fail', title: 'Nothing is held', detail: 'No buyer has set money aside yet.' }
      : short.length
        ? { id: 'money', status: 'fail', title: 'A hold is too small', detail: `${short.length} share(s) would cost more than what was set aside.` }
        : { id: 'money', status: 'pass', title: 'Every share is held, none is spent', detail: `${held.length} separate holds. Money moves only when everyone has said yes.` },
  );

  // 5. Group: enough quantity and every walk-away limit respected
  const total = held.reduce((a, c) => a + c.qty, 0);
  const over = held.filter(c => quote.unitPrice > c.maxUnitPrice + 0.0001);
  checks.push(
    total < deal.targetQty
      ? { id: 'group', status: 'fail', title: 'Group is too small', detail: `${total} of ${deal.targetQty} ${deal.product.unit}s.` }
      : over.length
        ? { id: 'group', status: 'fail', title: 'Above a buyer\'s limit', detail: `${over.length} buyer(s) set a lower walk-away price.` }
        : { id: 'group', status: 'pass', title: 'Group and limits are fine', detail: `${total} ${deal.product.unit}s from ${held.length} buyers, all within their limits.` },
  );

  const decision = checks.some(c => c.status === 'fail') ? 'block' : checks.some(c => c.status === 'warn') ? 'warn' : 'clear';
  return { sellerId: seller.id, decision, checks, ts: Date.now() };
}

/** Add or update a shared warning entry. A report from a new buying group raises `families`. */
export function reportSeller(name: string, reason: string, newFamily: boolean) {
  const k = key(name);
  const now = Date.now();
  let e = store.scamList.find(x => x.key === k);
  if (!e) {
    e = { key: k, name, reports: 0, families: 0, reasons: [], firstSeen: now, expiresAt: now + 30 * 86_400_000 };
    store.scamList.push(e);
  }
  e.reports += 1;
  if (newFamily) e.families += 1;
  if (reason && !e.reasons.includes(reason)) e.reasons.push(reason);
  e.expiresAt = now + 30 * 86_400_000; // entries fade after 30 quiet days; nobody is banned for ever
  return e;
}

export const money = (n: number) => `$${r2(n).toFixed(2)}`;
