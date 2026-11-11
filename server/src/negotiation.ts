import { config } from './config';
import { llm } from './llm';
import { pressureSpans } from './pause';
import type { Deal, Quote, Round, Seller } from '../../shared/types';

/** Negotiation is plain arithmetic. The model only phrases the agent's lines, and a phrased line
 *  is used only if it still contains the exact price. Prices never come from a model. */

export interface SellerProfile { kind: 'honest' | 'shady'; floor: number }

export const PROFILES: Record<string, SellerProfile> = {
  seller_metro: { kind: 'honest', floor: 0.64 },
  seller_fast: { kind: 'shady', floor: 0.38 },
};

const usd = (n: number) => `$${n.toFixed(2)}`;
const cents = (n: number) => Math.round(n * 100) / 100;

export function openingQuote(deal: Deal, seller: Seller, qty: number): Quote {
  const p = PROFILES[seller.id];
  if (p?.kind === 'shady') {
    const message = `Only today! ${qty.toLocaleString('en-US')} ${deal.product.unit}s at ${usd(0.38)} each, 100% genuine stock. Pay 50% advance to our personal UPI id now, no refunds. Offer ends in 1 hour, trust me.`;
    return { sellerId: seller.id, unitPrice: 0.38, qty, message, highlights: pressureSpans(message), status: 'received' };
  }
  const top = deal.tiers[deal.tiers.length - 1].unitPrice;
  const message = `Hello. For ${qty.toLocaleString('en-US')} ${deal.product.unit}s we can supply at our top rate of ${usd(top)} each, delivered in 5 days. Payment through the held deal is fine.`;
  return { sellerId: seller.id, unitPrice: top, qty, message, highlights: [], status: 'received' };
}

async function agentLine(kind: 'counter' | 'accept', price: number, seller: Seller, qty: number, unit: string): Promise<string> {
  const fallback = kind === 'counter'
    ? `We are a group of shop owners ordering ${qty.toLocaleString('en-US')} ${unit}s together. Can you do ${usd(price)} each?`
    : `Agreed at ${usd(price)} each for ${qty.toLocaleString('en-US')} ${unit}s, subject to every buyer's final yes.`;
  const out = await llm({
    fast: true,
    maxTokens: 120,
    system: `You are ${config.agentName}, a polite buying agent for a group of small shop owners. Write ONE short sentence (max 25 words) to the seller. You must include the exact text "${usd(price)}". Do not mention any other price. No emojis.`,
    user: kind === 'counter'
      ? `Ask ${seller.name} for ${usd(price)} per ${unit}. Total order ${qty} ${unit}s from a pooled group.`
      : `Accept ${seller.name}'s price of ${usd(price)} per ${unit} for ${qty} ${unit}s, subject to each buyer's final approval.`,
  });
  const line = out?.trim().replace(/^["']|["']$/g, '');
  return line && line.includes(usd(price)) && line.length < 220 ? line : fallback;
}

export interface NegotiationResult { agreed: number | null; rounds: Round[] }

/** Honest seller: converge toward the seller's floor. Agent never bids above `ceiling` (the lowest walk-away price). */
export async function negotiate(deal: Deal, seller: Seller, qty: number, ceiling: number, onRound: (r: Round) => Promise<void> | void): Promise<NegotiationResult> {
  const profile = PROFILES[seller.id];
  const rounds: Round[] = [];
  let n = 1;
  const push = async (by: Round['by'], unitPrice: number, text: string) => {
    const r: Round = { n: n++, sellerId: seller.id, by, unitPrice, text, ts: Date.now() };
    rounds.push(r);
    await onRound(r);
  };

  let ask = openingQuote(deal, seller, qty).unitPrice;
  await push('seller', ask, openingQuote(deal, seller, qty).message);
  let bid = cents(Math.min(ceiling, ask * 0.83));
  for (let i = 0; i < 4; i++) {
    if (ask - bid <= 0.02 + 1e-9) break;
    await push('agent', bid, await agentLine('counter', bid, seller, qty, deal.product.unit));
    const next = cents(Math.max(profile?.floor ?? ask, ask - (ask - bid) * 0.5));
    if (next < ask) {
      ask = next;
      await push('seller', ask, `We can come down to ${usd(ask)} each for ${qty.toLocaleString('en-US')} ${deal.product.unit}s.`);
    } else {
      await push('seller', ask, `${usd(ask)} is the lowest we can go.`);
    }
    bid = cents(Math.min(ceiling, bid + (ask - bid) * 0.6));
  }
  if (ask > ceiling + 1e-9) return { agreed: null, rounds };
  await push('agent', ask, await agentLine('accept', ask, seller, qty, deal.product.unit));
  return { agreed: ask, rounds };
}
