import { config } from './config';
import type { MarketItem } from '../../shared/types';

/** Channel3 product search (POST /v1/search, x-api-key). Used when a deal is created, to show real
 *  shop prices for the product, and again when the agent starts, as a cross-check. */
export async function searchMarket(query: string, limit = 8): Promise<MarketItem[]> {
  if (!config.channel3Key || !query.trim()) return [];
  const r = await fetch('https://api.trychannel3.com/v1/search', {
    method: 'POST',
    headers: { 'x-api-key': config.channel3Key, 'content-type': 'application/json' },
    body: JSON.stringify({ query: query.trim().slice(0, 120), limit }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error(`channel3 ${r.status}`);
  const j: any = await r.json();
  const out: MarketItem[] = [];
  for (const p of j.products ?? []) {
    const offer = (p.offers ?? [])[0];
    const raw = offer?.price;
    const price = typeof raw === 'number' ? raw : Number(raw?.price ?? raw?.amount ?? raw?.value);
    if (!Number.isFinite(price) || price <= 0) continue;
    out.push({
      title: String(p.title ?? p.name ?? 'Product').slice(0, 120),
      brand: p.brand_name ?? p.brand?.name ?? undefined,
      merchant: offer?.domain ?? offer?.merchant ?? offer?.website ?? undefined,
      price: Math.round(price * 100) / 100,
      image: p.image_url ?? p.images?.[0]?.url ?? (typeof p.images?.[0] === 'string' ? p.images[0] : undefined),
      url: offer?.url ?? p.url ?? undefined,
    });
  }
  return out;
}

export async function marketMedian(query: string): Promise<{ median: number; count: number } | null> {
  try {
    const items = await searchMarket(query, 12);
    if (!items.length) return null;
    const v = items.map(i => i.price).sort((a, b) => a - b);
    return { median: v[Math.floor(v.length / 2)], count: v.length };
  } catch (e) {
    console.warn('[market] channel3 failed:', (e as Error).message);
    return null;
  }
}
