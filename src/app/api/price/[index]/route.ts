/**
 * GET /api/price/[index]
 *
 * Returns a single index price synchronously from the shared in-memory cache
 * populated by /api/prices. Makes zero external API calls — responds in <1 ms.
 *
 * Fallback chain (all synchronous):
 *   1. Shared priceCache (written by /api/prices, shared within the same lambda)
 *   2. Hardcoded baseline prices — always returns 200, never hangs
 */

import { NextRequest, NextResponse } from 'next/server';
import { INDEX_DEFINITIONS } from '@/lib/indexes';
import { getPriceCache, INDEX_KEY, FALLBACK_PRICES } from '@/lib/priceCache';

export const dynamic     = 'force-dynamic';
export const maxDuration = 5; // hard cap — this route should respond in <1 ms

export async function GET(
  _req: NextRequest,
  { params }: { params: { index: string } },
) {
  const indexId = params.index;
  const def     = INDEX_DEFINITIONS[indexId];

  if (!def) {
    return NextResponse.json({ error: `Unknown index: ${indexId}` }, { status: 400 });
  }

  // ── 1. Read from shared cache (zero latency) ──────────────────────────────
  const cacheKey = INDEX_KEY[indexId];
  const cached   = getPriceCache();

  if (cached && cacheKey) {
    const price = cached[cacheKey];
    if (price > 0) {
      return NextResponse.json({
        indexId,
        name:      def.name,
        price,
        volume:    0,
        source:    'cache',
        fetchedAt: cached.updatedAt,
      });
    }
  }

  // ── 2. Hardcoded baseline — cold lambda, /api/prices not yet called ────────
  const fallbackPrice = FALLBACK_PRICES[indexId] ?? 50;
  console.warn(`[price/${indexId}] Cache empty — using hardcoded fallback $${fallbackPrice}`);

  return NextResponse.json({
    indexId,
    name:      def.name,
    price:     fallbackPrice,
    volume:    0,
    source:    'fallback',
    fetchedAt: Date.now(),
  });
}
