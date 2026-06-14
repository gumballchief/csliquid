/**
 * Shared in-memory price cache.
 *
 * This module is the single source of truth for bulk index prices within a
 * Vercel lambda instance. /api/prices populates it; /api/price/[index] reads
 * from it synchronously with no external API calls.
 *
 * Module-level singletons are shared across all route handlers bundled into
 * the same Node.js process, so a cache write in /api/prices is immediately
 * visible to /api/price/[index] within the same warm instance.
 */

export interface BulkIndexPrices {
  awp:       number;
  ak47:      number;
  knife:     number;
  glove:     number;
  cs500:     number;
  updatedAt: number;
}

/** Maps index route segment → BulkIndexPrices key. */
export const INDEX_KEY: Record<string, keyof Omit<BulkIndexPrices, 'updatedAt'>> = {
  'awp-index':   'awp',
  'ak47-index':  'ak47',
  'knife-index': 'knife',
  'glove-index': 'glove',
  'cs500-index': 'cs500',
};

/**
 * Hardcoded baseline prices (USD) — static-weight VWAP estimates for mid-2025.
 * Used only when the cache is empty (cold lambda with no prior /api/prices call).
 */
export const FALLBACK_PRICES: Record<string, number> = {
  'awp-index':    55,
  'ak47-index':   12,
  'knife-index': 480,
  'glove-index': 280,
  'cs500-index':  65,
};

// ── Singleton cache ────────────────────────────────────────────────────────────

interface CacheSlot { data: BulkIndexPrices; ts: number }
let _slot: CacheSlot | null = null;

export function getPriceCache(): BulkIndexPrices | null {
  return _slot?.data ?? null;
}

export function setPriceCache(data: BulkIndexPrices): void {
  _slot = { data, ts: Date.now() };
}

export function getPriceCacheAge(): number {
  return _slot ? Date.now() - _slot.ts : Infinity;
}
