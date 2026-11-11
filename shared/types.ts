// Shared contract between server and web. Types only (erased at runtime).

export type LangCode = 'en' | 'hi' | 'bgc' | 'ta' | 'te' | 'bn' | 'mr' | 'gu' | 'pa' | 'kn';

export interface Language {
  code: LangCode;
  name: string;      // English name
  native: string;    // Name in its own script
  speech: string;    // BCP-47 tag for speech recognition and voice replies
}

export type DealStatus = 'open' | 'negotiating' | 'review' | 'paid' | 'cancelled';
export type HoldMode = 'paypal' | 'simulated';
export type CommitStatus = 'awaiting_paypal' | 'held' | 'captured' | 'voided' | 'failed';
export type Approval = 'pending' | 'yes' | 'no';
export type Autonomy = 'ask' | 'auto';

export interface Tier { minQty: number; unitPrice: number }

export interface Seller {
  id: string;
  name: string;
  city: string;
  verified: boolean;
  tagline: string;
}

export interface Buyer {
  id: string;
  name: string;
  business: string;
  city: string;
  lang: LangCode;
  color: string;
  autonomy: Autonomy;
}

export interface Hold {
  mode: HoldMode;
  orderId?: string;
  authorizationId?: string;
  authorized: number;   // amount set aside (qty x walk-away price)
  currency: string;
  note?: string;
}

export interface Commitment {
  id: string;
  dealId: string;
  buyerId: string;
  qty: number;
  maxUnitPrice: number; // walk-away price
  status: CommitStatus;
  approval: Approval;
  hold?: Hold;
  captured?: number;
  captureId?: string;
  createdAt: number;
  note?: string;
}

export interface ChatMessage {
  id: string;
  dealId: string;
  from: 'buyer' | 'agent' | 'seller' | 'system';
  buyerId?: string;
  sellerId?: string;
  text: string;
  lang: LangCode;
  translations: Partial<Record<LangCode, string>>;
  ts: number;
}

export interface Highlight { start: number; end: number; label: string }

export interface Round {
  n: number;
  sellerId: string;
  by: 'agent' | 'seller';
  unitPrice: number;
  text: string;
  ts: number;
}

export interface Quote {
  sellerId: string;
  unitPrice: number;
  qty: number;
  message: string;
  highlights: Highlight[];
  status: 'received' | 'countering' | 'agreed' | 'rejected';
}

export type CheckStatus = 'pass' | 'warn' | 'fail';
export interface PauseCheck { id: 'price' | 'seller' | 'pressure' | 'money' | 'group'; status: CheckStatus; title: string; detail: string }
export interface PauseReport { sellerId: string; decision: 'clear' | 'warn' | 'block'; checks: PauseCheck[]; ts: number }

export interface TimelineEvent {
  id: string;
  dealId: string;
  ts: number;
  kind: string;
  text: string;
  tone: 'info' | 'good' | 'warn' | 'bad';
}

export interface Deal {
  id: string;
  title: string;
  product: { name: string; pack: string; unit: string };
  tiers: Tier[];                // the public rate card
  marketPrice: number;          // retail benchmark per unit
  marketSource: string;
  targetQty: number;
  deadline: number;
  status: DealStatus;
  sellerIds: string[];
  quotes: Quote[];
  rounds: Round[];
  chosenSellerId?: string;
  finalUnitPrice?: number;
  undoUntil?: number;           // end of the Undo window; money moves only after this
  pause: Record<string, PauseReport>;
  summary?: { totalQty: number; listPrice: number; finalPrice: number; savedPerUnit: number; savedTotal: number; paidTotal: number };
}

export interface ScamEntry {
  key: string;
  name: string;
  reports: number;
  families: number;
  reasons: string[];
  firstSeen: number;
  expiresAt: number;
}

export interface PublicConfig {
  paypalMode: 'sandbox' | 'simulated';
  paypalClientId?: string;
  aiMode: 'live' | 'offline';
  aiProvider?: string;
  priceSource: 'channel3' | 'benchmark';
  currency: string;
  languages: Language[];
  agentName: string;
}

export interface AppState {
  deals: Deal[];
  sellers: Seller[];
  buyers: Buyer[];
  commitments: Commitment[];
  messages: ChatMessage[];
  events: TimelineEvent[];
  scamList: ScamEntry[];
  storyStep: number;
  storyTotal: number;
  config: PublicConfig;
  now: number;
}

export interface AssistantReply {
  reply: string;
  lang: LangCode;
  suggest?: { label: string; action: 'join' | 'approve' | 'reject' | 'negotiate' | 'withdraw' };
}
