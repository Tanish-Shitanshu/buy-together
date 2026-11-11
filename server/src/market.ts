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

// Filled in once the Channel3 API shape is confirmed.
async function channel3Median(_q: string): Promise<number | null> { return null; }
