import { config } from './config';

/** Market price check. Uses Channel3 when a key is set, otherwise the seeded benchmark. */
export async function checkMarketPrice(productName: string, benchmark: number): Promise<{ price: number; source: 'channel3' | 'benchmark' }> {
  if (!config.channel3Key) return { price: benchmark, source: 'benchmark' };
  try {
    const price = await channel3Median(productName);
    if (price && price > 0) return { price, source: 'channel3' };
  } catch (e) {
    console.warn('[market] channel3 failed, using benchmark:', (e as Error).message);
  }
  return { price: benchmark, source: 'benchmark' };
}

/** Channel3 v1 search: POST /v1/search with x-api-key. Takes the median offer price of the top hits.
 *  Pack prices (a 12-pack, say) are far above one can, so anything outside a per-can range is ignored. */
async function channel3Median(q: string): Promise<number | null> {
  const r = await fetch('https://api.trychannel3.com/v1/search', {
    method: 'POST',
    headers: { 'x-api-key': config.channel3Key, 'content-type': 'application/json' },
    body: JSON.stringify({ query: `${q} single can 330 ml`, limit: 12 }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`channel3 ${r.status}`);
  const j: any = await r.json();
  const prices: number[] = [];
  for (const p of j.products ?? []) for (const o of p.offers ?? []) {
    const v = typeof o.price === 'number' ? o.price : Number(o.price?.price ?? o.price?.amount);
    if (Number.isFinite(v) && v >= 0.3 && v <= 3) prices.push(v);
  }
  if (!prices.length) return null;
  prices.sort((a, b) => a - b);
  return Math.round(prices[Math.floor(prices.length / 2)] * 100) / 100;
}
