import fs from 'node:fs';
import path from 'node:path';
import { config, LANGUAGES, aiProvider } from './config';
import type {
  AppState, Buyer, JoinRequest, ChatMessage, Commitment, Deal, PublicConfig, ScamEntry, Seller, TimelineEvent, LangCode,
} from '../../shared/types';

export interface Store {
  deals: Deal[];
  sellers: Seller[];
  buyers: Buyer[];
  commitments: Commitment[];
  messages: ChatMessage[];
  events: TimelineEvent[];
  scamList: ScamEntry[];
  storyStep: number;
  joinRequests: JoinRequest[];
}

export const DAY = 86_400_000;
export const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 8)}`;
export const r2 = (n: number) => Math.round(n * 100) / 100;
export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export const DEAL_ID = 'deal_water';
export const STORY_TOTAL = 5;

export function seed(): Store {
  const now = Date.now();
  const sellers: Seller[] = [
    { id: 'seller_metro', name: 'Metro Wholesale Co.', city: 'Delhi', verified: true, tagline: 'Licensed beverage distributor, 12 years' },
    { id: 'seller_fast', name: 'FastBulk Deals', city: 'unknown', verified: false, tagline: 'New seller, no trade licence on file' },
  ];
  const buyers: Buyer[] = [
    { id: 'b_ravi', name: 'Ravi', business: 'Ravi Kirana Store', city: 'Rohtak', lang: 'bgc', color: '#E8590C', autonomy: 'ask' },
    { id: 'b_meena', name: 'Meena', business: 'Meena Tiffin Centre', city: 'Chennai', lang: 'ta', color: '#1C7C7D', autonomy: 'auto' },
    { id: 'b_arjun', name: 'Arjun', business: 'Arjun Juice Bar', city: 'Pune', lang: 'mr', color: '#4C4BC4', autonomy: 'auto' },
    { id: 'b_fatima', name: 'Fatima', business: 'Fatima Sweets', city: 'Hyderabad', lang: 'te', color: '#2F9E44', autonomy: 'auto' },
    { id: 'b_amrit', name: 'Amrit', business: 'Amrit Dhaba', city: 'Ludhiana', lang: 'pa', color: '#D6336C', autonomy: 'auto' },
  ];
  const deal: Deal = {
    id: DEAL_ID,
    title: 'Sparkling water, 330 ml cans',
    product: { name: 'Sparkling water', pack: '330 ml can', unit: 'can' },
    tiers: [
      { minQty: 1, unitPrice: 0.95 },
      { minQty: 300, unitPrice: 0.85 },
      { minQty: 600, unitPrice: 0.78 },
      { minQty: 1000, unitPrice: 0.70 },
    ],
    marketPrice: 1.05,
    marketSource: 'benchmark',
    targetQty: 1000,
    deadline: now + 2 * DAY,
    status: 'open',
    sellerIds: sellers.map(s => s.id),
    quotes: [],
    rounds: [],
    pause: {},
  };
  const held = (buyerId: string, qty: number, max: number): Commitment => ({
    id: uid('c'), dealId: DEAL_ID, buyerId, qty, maxUnitPrice: max, status: 'held', approval: 'pending', createdAt: now,
    hold: { mode: 'simulated', authorized: r2(qty * max), currency: config.currency, note: 'Simulated hold for a demo buyer' },
  });
  const commitments = [held('b_arjun', 200, 0.76), held('b_fatima', 150, 0.75), held('b_amrit', 180, 0.74)];
  const scamList: ScamEntry[] = [
    { key: 'fastbulk deals', name: 'FastBulk Deals', reports: 14, families: 9, reasons: ['Price far below market', 'Asked for advance outside the platform', 'Pressure to pay within the hour'], firstSeen: now - 6 * DAY, expiresAt: now + 24 * DAY },
  ];
  return { deals: [deal], sellers, buyers, commitments, messages: [], events: [], scamList, storyStep: 0, joinRequests: [] };
}

const file = () => path.join(config.dataDir, 'state.json');

function load(): Store {
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8')) as Store;
    if (raw?.deals?.length) { raw.joinRequests ??= []; return raw; }
  } catch { /* first run */ }
  return seed();
}

export const store: Store = load();

let saveTimer: NodeJS.Timeout | null = null;
function persist() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(config.dataDir, { recursive: true });
      fs.writeFileSync(file(), JSON.stringify(store));
    } catch (e) { console.warn('[store] persist failed', (e as Error).message); }
  }, 250);
}

type Listener = (s: AppState) => void;
const listeners = new Set<Listener>();
export const subscribe = (fn: Listener) => { listeners.add(fn); return () => listeners.delete(fn); };

export function publicConfig(): PublicConfig {
  return {
    paypalMode: config.paypal.enabled ? 'sandbox' : 'simulated',
    paypalClientId: config.paypal.enabled ? config.paypal.clientId : undefined,
    aiMode: aiProvider() ? 'live' : 'offline',
    aiProvider: aiProvider() ?? undefined,
    priceSource: config.channel3Key ? 'channel3' : 'benchmark',
    currency: config.currency,
    languages: LANGUAGES,
    agentName: config.agentName,
  };
}

export function snapshot(): AppState {
  return { ...store, config: publicConfig(), storyTotal: STORY_TOTAL, now: Date.now() };
}

/** Call after every mutation: persists and pushes a fresh snapshot to every open stream. */
export function commit() {
  persist();
  const s = snapshot();
  for (const l of listeners) { try { l(s); } catch { /* closed stream */ } }
}

export function resetStore() {
  const fresh = seed();
  Object.assign(store, fresh);
  commit();
}

export function addEvent(dealId: string, kind: string, text: string, tone: TimelineEvent['tone'] = 'info') {
  store.events.push({ id: uid('e'), dealId, ts: Date.now(), kind, text, tone });
  if (store.events.length > 300) store.events.splice(0, store.events.length - 300);
}

export function addMessage(m: Omit<ChatMessage, 'id' | 'ts' | 'translations'> & { translations?: ChatMessage['translations'] }): ChatMessage {
  const msg: ChatMessage = { id: uid('m'), ts: Date.now(), translations: {}, ...m };
  store.messages.push(msg);
  if (store.messages.length > 400) store.messages.splice(0, store.messages.length - 400);
  return msg;
}

export const getDeal = (id: string) => store.deals.find(d => d.id === id);
export const getBuyer = (id: string) => store.buyers.find(b => b.id === id);
export const getSeller = (id: string) => store.sellers.find(s => s.id === id);
export const dealCommitments = (dealId: string) =>
  store.commitments.filter(c => c.dealId === dealId && (c.status === 'held' || c.status === 'awaiting_paypal' || c.status === 'captured'));
export const heldCommitments = (dealId: string) => store.commitments.filter(c => c.dealId === dealId && c.status === 'held');
export const heldQty = (dealId: string) => heldCommitments(dealId).reduce((a, c) => a + c.qty, 0);

export function tierFor(deal: Deal, qty: number) {
  let t = deal.tiers[0];
  for (const x of deal.tiers) if (qty >= x.minQty) t = x;
  return t;
}

export const languagesInDeal = (dealId: string): LangCode[] => {
  const set = new Set<LangCode>(['en']);
  for (const c of store.commitments.filter(c => c.dealId === dealId && c.status !== 'voided')) {
    const b = getBuyer(c.buyerId);
    if (b) set.add(b.lang);
  }
  return [...set];
};

export function createDeal(p: { productName: string; pack: string; unit: string; marketPrice: number; targetQty: number; createdBy?: string; marketSource?: string }): Deal {
  const base = r2(p.marketPrice * 0.905);
  const at = (f: number) => Math.max(1, Math.round(p.targetQty * f));
  const tiers = [
    { minQty: 1, unitPrice: base },
    { minQty: at(0.3), unitPrice: r2(p.marketPrice * 0.81) },
    { minQty: at(0.6), unitPrice: r2(p.marketPrice * 0.743) },
    { minQty: p.targetQty, unitPrice: r2(p.marketPrice * 0.667) },
  ];
  const deal: Deal = {
    id: uid('deal'),
    title: `${p.productName}, ${p.pack}`,
    product: { name: p.productName, pack: p.pack, unit: p.unit },
    tiers, marketPrice: r2(p.marketPrice), marketSource: p.marketSource ?? 'entered by buyer',
    targetQty: p.targetQty, deadline: Date.now() + 2 * DAY, status: 'open',
    sellerIds: store.sellers.map(s => s.id), quotes: [], rounds: [], pause: {}, createdBy: p.createdBy,
  };
  store.deals.push(deal);
  addEvent(deal.id, 'create', `New deal: ${deal.title}. Agent starts at ${p.targetQty} ${p.unit}s.`, 'good');
  return deal;
}
