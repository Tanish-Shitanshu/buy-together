import { config, langName } from './config';
import { llmJson } from './llm';
import { translateMany } from './chat';
import { getBuyer, getDeal, getSeller, heldCommitments, heldQty, store, tierFor } from './store';
import type { AssistantReply, LangCode } from '../../shared/types';

const usd = (n: number) => `$${n.toFixed(2)}`;

/** Facts the assistant may use. Everything numeric comes from here, never from the model. */
export function dealFacts(dealId: string, buyerId: string) {
  const deal = getDeal(dealId)!;
  const buyer = getBuyer(buyerId);
  const mine = store.commitments.find(c => c.dealId === dealId && c.buyerId === buyerId && (c.status === 'held' || c.status === 'awaiting_paypal' || c.status === 'captured'));
  const total = heldQty(dealId);
  const tier = tierFor(deal, total);
  const next = deal.tiers.find(t => t.minQty > total);
  const seller = deal.chosenSellerId ? getSeller(deal.chosenSellerId) : undefined;
  return {
    product: `${deal.product.name}, ${deal.product.pack}`,
    status: deal.status,
    groupQty: total,
    buyersInGroup: heldCommitments(dealId).length,
    currentTierPrice: tier.unitPrice,
    nextTier: next ? { atQty: next.minQty, price: next.unitPrice, moreNeeded: next.minQty - total } : null,
    agentStartsAt: deal.targetQty,
    marketPrice: deal.marketPrice,
    chosenSeller: seller?.name ?? null,
    finalPrice: deal.finalUnitPrice ?? null,
    pauseDecision: deal.chosenSellerId ? deal.pause[deal.chosenSellerId]?.decision ?? null : null,
    undoOpenUntil: deal.undoUntil ?? null,
    you: buyer && mine ? { name: buyer.name, qty: mine.qty, walkAwayPrice: mine.maxUnitPrice, held: mine.hold?.authorized ?? 0, approval: mine.approval, status: mine.status, paid: mine.captured ?? null } : { name: buyer?.name ?? 'guest', joined: false },
  };
}

function plainReply(f: ReturnType<typeof dealFacts>): AssistantReply['suggest'] extends infer S ? { text: string; suggest?: S } : never {
  const you: any = f.you;
  if (f.status === 'paid') return { text: `The deal is done. You paid ${you.paid != null ? usd(you.paid) : 'your share'}. The rest of your hold went back.` } as any;
  if (f.status === 'cancelled') return { text: 'This deal was cancelled. Every hold was returned and no money was spent.' } as any;
  if (f.status === 'review') {
    if (you.approval === 'pending') return { text: `${f.chosenSeller} offers ${usd(f.finalPrice!)} each. Pause says ${f.pauseDecision}. Your limit was ${usd(you.walkAwayPrice)}. Do you approve?`, suggest: { label: 'Approve', action: 'approve' } } as any;
    return { text: `You said ${you.approval}. The price is ${usd(f.finalPrice!)} each. Money moves only after everyone says yes and the undo window ends.` } as any;
  }
  if (f.status === 'negotiating') return { text: `${config.agentName} is talking to sellers now. Pause checks every offer first.` } as any;
  if (you.joined === false) return { text: `${f.groupQty} are in so far at ${usd(f.currentTierPrice)} each. Join with your quantity and your highest price. Your money is only held.`, suggest: { label: 'Join', action: 'join' } } as any;
  const n = f.nextTier;
  return { text: `You are in with ${you.qty}. ${usd(you.held)} is held, not spent. The group has ${f.groupQty}${n ? `; ${n.moreNeeded} more reaches ${usd(n.price)} each` : ''}.` } as any;
}

export async function ask(p: { dealId: string; buyerId: string; text: string; lang: LangCode }): Promise<AssistantReply> {
  const facts = dealFacts(p.dealId, p.buyerId);
  const out = await llmJson<{ reply: string; action?: string }>({
    maxTokens: 500,
    system: `You are ${config.agentName}, a calm helper for a small shop owner using a group-buying app. Answer in ${langName(p.lang)}, in short spoken words, at most 3 sentences. Use only the facts given; every number you say must appear in the facts. If asked for something the app cannot do, say so. If the person clearly wants to do one thing, set "action" to one of join, approve, reject, negotiate, withdraw, otherwise leave it out. Reply as JSON: {"reply": string, "action"?: string}.`,
    user: `Facts: ${JSON.stringify(facts)}\nPerson says: ${p.text}`,
  });
  const plain = plainReply(facts) as any as { text: string; suggest?: AssistantReply['suggest'] };
  if (out?.reply) {
    const labels: Record<string, string> = { join: 'Join', approve: 'Approve', reject: 'Say no', negotiate: 'Start agent', withdraw: 'Leave deal' };
    const act = out.action && labels[out.action] ? { label: labels[out.action], action: out.action as any } : undefined;
    return { reply: out.reply, lang: p.lang, suggest: act };
  }
  // Offline: code-written reply, translated when a model is available.
  const tr = p.lang === 'en' ? {} : await translateMany(plain.text, 'en', [p.lang]);
  return { reply: tr[p.lang] ?? plain.text, lang: tr[p.lang] ? p.lang : 'en', suggest: plain.suggest };
}
