import type { Deal, Highlight, PauseCheck, PauseReport, Quote, Seller } from '../../shared/types';
import { store, heldCommitments, r2 } from './store';
import { llmJson } from './llm';

/** Pause: five plain-code checks that run before any money moves.
 *  No model decides anything here. A model may only help spot pressure wording (see pressureSpans). */

const PRESSURE: { re: RegExp; label: string }[] = [
  { re: /only (today|tonight|for \d+ (hours?|minutes?))|sirf aaj|aaj (raat|hi)|last chance|offer (ends|valid till the clock)|ends? in \d+ ?(hours?|minutes?|mins?)|within (the )?(\d+ ?(hours?|minutes?|mins?)|hour)|in the next (hour|\d+ ?(hours?|minutes?))|by tonight|tonight is the|today itself|before midnight|booking closes|closing (the deal )?today|(rate|price) (will|is going to) (go up|double|increase)|after (tonight|this) the (rate|price)|hurry|jaldi|act now|move fast|(do not|don.t) waste time|limited stock|slots? (are )?(filling|left)|(almost|nearly) over|only (two|three|\d+) \w+ left|once in a (year|lifetime)|clearance|(right now only|only right now)|cancelled automatically/gi, label: 'Time pressure' },
  { re: /advance(?! notice)|upfront|pay (directly|first|before|me)|pay(ing)? to my|pehle paisa|paisa (daal|bhej)|send (the )?(money|funds|amount|payment)|send it to my|send directly|(deposit|transfer|wire|daal|bhej)\b[^.]{0,40}\b(account|number|wallet|iban|upi)|(deposit|wire|transfer) the (token|amount|advance|funds|money)|token amount|booking fee|registration fee|security deposit|customs duty|processing fee|personal (account|number|upi)|upi( id)?\b|paytm|gpay|google pay|phonepe|whatsapp pay|qr code|wallet|iban|bank wire|western union|remitly|gift ?cards?|crypto|bitcoin|voucher code|prepaid voucher|cash deposit|family transfer|(friend|cousin|brother|agent)'?s? (account|number)|(other|another|savings) (payment page|account)|this link i am|(do not|don't|cannot|can't) (use|take) the (escrow|platform)|skip (the )?(platform|escrow)|outside (the )?(app|platform)|off[- ]platform|bank transfer to/gi, label: 'Pays outside the held deal' },
  { re: /no refunds?|non[- ]?refundable|final sale|cannot cancel/gi, label: 'No way back' },
  { re: /100% (safe|genuine|guaranteed)|trust (me|the process)|risk[- ]?free|guaranteed (lowest|delivery|price|rate|profit|returns|safe|genuine)|believe me|zero chance|written assurance|you will not regret|koi dikkat nahi|pakka hai|i promise/gi, label: 'Empty assurance' },
  { re: /do not tell|don't tell|keep (it|this) between us|quietly|only one i am giving|special rate only for you|no one else/gi, label: 'Asks for secrecy' },
  { re: /card details|photo of (the |your )?card|\botp\b|bank login|net ?banking|password|\bcvv\b|\bpin\b/gi, label: 'Asks for card or login details' },
];

/** Words just before a match that turn it around ("we do not need any advance"). */
const NEGATION = /\b(do not|don't|dont|never|not|no need|without|nahi|nahin|won't|will not)\b[^.]{0,30}$/i;

export function pressureSpans(text: string): Highlight[] {
  const out: Highlight[] = [];
  for (const { re, label } of PRESSURE) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (NEGATION.test(text.slice(Math.max(0, m.index - 40), m.index))) continue;
      out.push({ start: m.index, end: m.index + m[0].length, label });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** A model may help read the message: it points at words, from a fixed list of kinds. Code checks every phrase
 *  really appears in the message before it counts, and code alone decides what to do about it (messageVerdict). */
export async function modelSpans(text: string): Promise<Highlight[]> {
  const kinds = PRESSURE.map(p => p.label);
  const r = await llmJson<{ flags?: { kind?: string; phrase?: string }[] }>({
    system: `You check a seller's message to a group of shop owners. The group pays only through a platform that holds their money until delivery. Mark every phrase that does one of these: ${kinds.join('; ')}.
Meaning of each kind: "Time pressure" = a deadline, countdown, vanishing stock or price rise used to rush a decision. "Pays outside the held deal" = any request to pay by cash, wallet, UPI, bank, transfer, link, voucher, a person's own number or any route other than the platform, including fees, deposits, tokens or charges paid first. "No way back" = no refund, no cancel, no return. "Empty assurance" = promises or trust talk with no proof. "Asks for secrecy" = keep it quiet, tell no one, only for you. "Asks for card or login details" = OTP, PIN, password, card or bank login.
Examples:
Message: "Stock ends tonight. Put the amount in my cousin's wallet and don't mention it to the others."
{"flags":[{"kind":"Time pressure","phrase":"Stock ends tonight"},{"kind":"Pays outside the held deal","phrase":"Put the amount in my cousin's wallet"},{"kind":"Asks for secrecy","phrase":"don't mention it to the others"}]}
Message: "Pay a clearance fee on this link first, otherwise the shipment is returned. Whatever happens, it is sold as is."
{"flags":[{"kind":"Pays outside the held deal","phrase":"Pay a clearance fee on this link first"},{"kind":"No way back","phrase":"it is sold as is"}]}
Message: "Read me the code that arrives by SMS so I can confirm you. You can rely on me completely."
{"flags":[{"kind":"Asks for card or login details","phrase":"Read me the code that arrives by SMS"},{"kind":"Empty assurance","phrase":"You can rely on me completely"}]}
Message: "Kal tak confirm karo warna rate badh jayega, aur paisa mere bhai ke number pe bhej do, wapas nahi milega."
{"flags":[{"kind":"Time pressure","phrase":"Kal tak confirm karo warna rate badh jayega"},{"kind":"Pays outside the held deal","phrase":"paisa mere bhai ke number pe bhej do"},{"kind":"No way back","phrase":"wapas nahi milega"}]}
Message: "Only the first five buyers get this rate, so decide quickly. No returns once the cartons are packed."
{"flags":[{"kind":"Time pressure","phrase":"decide quickly"},{"kind":"No way back","phrase":"No returns once the cartons are packed"}]}
Message: "We can deliver 600 cans in six days at the quoted rate. Payment is through the held deal, so nothing is due before delivery."
{"flags":[]}
Reply with JSON only: {"flags":[{"kind":"<one kind from the list>","phrase":"<exact words copied from the message>"}]}. Normal messages about delivery, price, quantity, quality or deadlines for delivery are not flags; reply {"flags":[]}. Never invent words.`,
    user: text.slice(0, 1000), fast: true, maxTokens: 1500,
  });
  const out: Highlight[] = [];
  const low = text.toLowerCase();
  for (const f of r?.flags ?? []) {
    const phrase = String(f.phrase ?? '').trim();
    const kind = kinds.find(k => k === f.kind);
    const at = phrase.length >= 3 ? low.indexOf(phrase.toLowerCase()) : -1;
    if (kind && at >= 0) out.push({ start: at, end: at + phrase.length, label: kind });
  }
  return out;
}

/** Wording rules first, then the model's pointers on top (union). */
export async function checkText(text: string, useModel = true): Promise<Highlight[]> {
  const base = pressureSpans(text);
  if (!useModel) return base;
  const extra = (await modelSpans(text)).filter(m => !base.some(b => b.label === m.label && b.start < m.end && m.start < b.end));
  return [...base, ...extra].sort((a, b) => a.start - b.start);
}

/** The one rule the app uses: asking for money outside the held deal or for card or login details fails on its own;
 *  two or more kinds of pressure fail; a single softer kind is a warning. */
export function messageVerdict(spans: Highlight[]): { status: 'pass' | 'warn' | 'fail'; kinds: string[] } {
  const kinds = [...new Set(spans.map(s => s.label))];
  const severe = kinds.includes('Pays outside the held deal') || kinds.includes('Asks for card or login details');
  return { status: severe || kinds.length >= 2 ? 'fail' : kinds.length === 1 ? 'warn' : 'pass', kinds };
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
  const { status: msgStatus, kinds } = messageVerdict(spans);
  checks.push(
    msgStatus === 'fail'
      ? { id: 'pressure', status: 'fail', title: 'Pressure and off-platform payment', detail: `The message uses: ${kinds.join(', ').toLowerCase()}.` }
      : msgStatus === 'warn'
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
